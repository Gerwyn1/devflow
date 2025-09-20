"use server";

import Question, { IQuestionDoc } from "@/database/question.model";
import action from "../handlers/action";
import handleError from "../handlers/error";
import {
  AskQuestionSchema,
  DeleteQuestionSchema,
  EditQuestionSchema,
  GetQuestionSchema,
  IncrementViewsSchema,
  PaginatedSearchParamsSchema,
} from "../validations";
import mongoose, { FilterQuery, Types } from "mongoose";
import Tag, { ITagDoc } from "@/database/tag.model";
import TagQuestion from "@/database/tag-question.model";
import { NotFoundError, UnauthorizedError } from "../http-errors";
import dbConnect from "../mongoose";
import { Answer, Collection, Interaction, Vote } from "@/database";
import { revalidatePath } from "next/cache";
import { createInteraction } from "./interaction.action";
import { after } from "next/server";
import { auth } from "@/auth";
import { cache } from "react";

export async function createQuestion(params: CreateQuestionParams): Promise<ActionResponse<Question>> {
  const validationResult = await action({ params, schema: AskQuestionSchema, authorize: true });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { title, content, tags } = validationResult.params!;
  const userId = validationResult!.session!.user!.id!;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [question] = await Question.create([{ title, content, author: userId }], { session });

    if (!question) throw new Error("Failed to create the question");

    const tagIds: mongoose.Types.ObjectId[] = [];
    const tagQuestionDocuments = [];
    for (const tag of tags) {
      const existingTag = await Tag.findOneAndUpdate(
        {
          name: { $regex: `^${tag}$`, $options: "i" },
        },
        { $setOnInsert: { name: tag }, $inc: { questions: 1 } },
        { upsert: true, new: true, session }
      );
      tagIds.push(existingTag._id);
      tagQuestionDocuments.push({
        tag: existingTag._id,
        question: question._id,
      });
    }
    await TagQuestion.insertMany(tagQuestionDocuments, { session });

    await Question.findByIdAndUpdate(question._id, { $push: { tags: { $each: tagIds } } }, { session });

    await session.commitTransaction();

    // log the interaction
    after(async () => {
      await createInteraction({
        action: "post",
        actionId: question._id.toString(),
        actionTarget: "question",
        authorId: userId as string,
      });
    });

    return { success: true, data: JSON.parse(JSON.stringify(question)), status: 201 };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

// $addToSet (non duplicates)

export async function editQuestion(params: EditQuestionParams): Promise<ActionResponse<IQuestionDoc>> {
  const validationResult = await action({ params, schema: EditQuestionSchema, authorize: true });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { title, content, tags, questionId } = validationResult.params!;
  const userId = validationResult!.session!.user!.id!;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const question = await Question.findById(questionId).populate("tags");
    if (!question) throw new NotFoundError("Question");

    if (question.author.toString() !== userId) {
      throw new UnauthorizedError("You are not authorized to edit this question");
    }

    if (question.title !== title || question.content !== content) {
      question.title = title;
      question.content = content;
      await question.save({ session });
    }

    const tagsToAdd = tags.filter(
      (tag) => !question.tags.some((t: ITagDoc) => t.name.toLowerCase().includes(tag.toLowerCase()))
    );

    const tagsToRemove = question.tags.filter(
      (tag: ITagDoc) => !tags.some((t) => t.toLowerCase() === tag.name.toLowerCase())
    );

    const newTagDocuments = [];

    if (tagsToAdd.length > 0) {
      for (const tag of tagsToAdd) {
        const newTag = await Tag.findOneAndUpdate(
          { name: { $regex: `^${tag}$`, $options: "i" } },
          { $setOnInsert: { name: tag }, $inc: { questions: 1 } },
          { upsert: true, new: true, session }
        );

        if (newTag) {
          newTagDocuments.push({ tag: newTag._id, question: questionId });
          question.tags.push(newTag._id);
        }
      }
    }

    if (tagsToRemove.length > 0) {
      const tagIdsToRemove = tagsToRemove.map((tag: ITagDoc) => tag._id);

      await Tag.updateMany({ _id: { $in: tagIdsToRemove } }, { $inc: { questions: -1 } }, { session });
      // await Tag.deleteMany({ _id: { $in: tagIdsToRemove }, questions: 0 }, { session });

      await TagQuestion.deleteMany({ tag: { $in: tagIdsToRemove }, question: questionId }, { session });

      question.tags = question.tags.filter(
        (tag: mongoose.Types.ObjectId) => !tagIdsToRemove.some((id: mongoose.Types.ObjectId) => id.equals(tag._id))
      );
    }

    if (newTagDocuments.length > 0) {
      await TagQuestion.insertMany(newTagDocuments, { session });
    }

    // Save the updated question
    await question.save({ session });
    await session.commitTransaction();

    return { success: true, data: JSON.parse(JSON.stringify(question)), status: 200 };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export const getQuestion = cache(async function getQuestion(
  params: GetQuestionParams
): Promise<ActionResponse<Question>> {
  const validationResult = await action({
    params,
    schema: GetQuestionSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;

  try {
    const question = await Question.findById(questionId).populate("tags").populate("author", "_id name image");
    if (!question) throw new NotFoundError("Question");

    return { success: true, data: JSON.parse(JSON.stringify(question)), status: 200 };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
});

export async function getQuestions(params: PaginatedSearchParams): Promise<
  ActionResponse<{
    questions: Question[];
    isNext: boolean;
  }>
> {
  const validationResult = await action({
    params,
    schema: PaginatedSearchParamsSchema,
  });
  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { page = 1, pageSize = 10, query, filter } = params;

  const skip = (Number(page) - 1) * pageSize;
  const limit = pageSize;

  const filterQuery: FilterQuery<typeof Question> = {};

  if (filter === "recommended") {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return { success: true, data: { questions: [], isNext: false } };
    }

    const recommended = await getRecommendedQuestions({ skip, limit, query, userId });
    return { success: true, data: recommended };
  }

  if (query) {
    filterQuery.$or = [{ title: { $regex: query, $options: "i" } }, { content: { $regex: query, $options: "i" } }];
  }

  let sortCriteria = {};

  // Filters
  switch (filter) {
    case "newest":
      sortCriteria = { createdAt: -1, _id: 1 };
      break;
    case "unanswered":
      filterQuery.answers = 0;
      sortCriteria = { createdAt: -1, _id: 1 };
      break;
    case "popular":
      sortCriteria = { upvotes: -1, _id: 1 };
      break;
    default:
      sortCriteria = { createdAt: -1, _id: 1 };
      break;
  }

  try {
    const totalQuestions = await Question.countDocuments(filterQuery);
    const questions = await Question.find(filterQuery)
      .populate("tags", "name")
      .populate("author", "name image")
      .lean()
      .sort(sortCriteria)
      .skip(skip)
      .limit(limit);

    const isNext = totalQuestions > skip + questions.length;
    return { success: true, data: { questions: JSON.parse(JSON.stringify(questions)), isNext }, status: 200 };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function incrementViews(params: IncrementViewsParams): Promise<ActionResponse<{ views: number }>> {
  const validationResult = await action({
    params,
    schema: IncrementViewsSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;

  try {
    const question = await Question.findById(questionId);

    if (!question) {
      throw new NotFoundError("Question");
    }

    question.views += 1;

    await question.save();

    return { success: true, data: { views: question.views }, status: 200 };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function getHotQuestions(): Promise<ActionResponse<Question[]>> {
  try {
    await dbConnect();
    const questions = await Question.find().sort({ views: -1, upvotes: -1 }).limit(5);
    return { success: true, data: JSON.parse(JSON.stringify(questions)), status: 200 };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function deleteQuestion(params: DeleteQuestionParams): Promise<ActionResponse> {
  const validationResult = await action({
    params,
    schema: DeleteQuestionSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;
  const { user } = validationResult.session!;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const question = await Question.findById(questionId).session(session);
    if (!question) throw new NotFoundError("Question");

    if (user?.id !== question?.author.toString()) {
      throw new UnauthorizedError("You are not authorized to delete this question");
    }

    // Delete references from collection
    await Collection.deleteMany({ question: questionId }).session(session);

    // Delete references from TagQuestion collection
    await TagQuestion.deleteMany({ question: questionId }).session(session);

    // For all tags of Question, find them and reduce their count
    if (question.tags.length > 0) {
      await Tag.updateMany({ _id: { $in: question.tags } }, { $inc: { questions: -1 } }, { session });
    }

    // Remove all votes of the question
    await Vote.deleteMany({ actionId: questionId, actionType: "question" }).session(session);

    // Remove all answers and their votes of the question
    const answers = await Answer.find({ question: questionId }).session(session);

    if (answers.length > 0) {
      await Answer.deleteMany({ question: questionId }).session(session);
      await Vote.deleteMany({ _id: { $in: answers.map((answer) => answer._id) } }).session(session);
    }

    // Delete question
    await Question.findByIdAndDelete(questionId).session(session);

    // Commit transaction
    await session.commitTransaction();

    // Revalidate to reflect immediate changes on UI
    revalidatePath(`/profile/${user?.id}`);

    return { success: true, status: 200 };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
}

export async function getRecommendedQuestions({ userId, query, skip, limit }: RecommendationParams) {
  // const filterQuery: FilterQuery<typeof Question> = {};
  // if (query) {
  //   filterQuery.$or = [{ title: { $regex: query, $options: "i" } }, { content: { $regex: query, $options: "i" } }];
  // }

  const interactions = await Interaction.find({
    user: new Types.ObjectId(userId),
    actionType: "question",
    action: { $in: ["view", "upvote", "bookmark", "post"] },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const interactedQuestionIds = interactions.map((i) => i.actionId);

  const interactedQuestions = await Question.find({
    _id: { $in: interactedQuestionIds },
  }).select("tags");

  const allTags = interactedQuestions.flatMap((q) => q.tags.map((tag: Types.ObjectId) => tag.toString()));
  const uniqueTagIds = [...new Set(allTags)];

  const recommendedQuery: FilterQuery<typeof Question> = {
    _id: { $nin: interactedQuestionIds },
    author: { $ne: new Types.ObjectId(userId) },
    tags: { $in: uniqueTagIds.map((id: string) => new Types.ObjectId(id)) },
  };

  if (query) {
    recommendedQuery.$or = [{ title: { $regex: query, $options: "i" } }, { content: { $regex: query, $options: "i" } }];
  }

  // const interactedQuestionIds = await Interaction.distinct("actionId", {
  //   user: new Types.ObjectId(userId),
  //   actionType: "question",
  //   action: { $in: ["view", "upvote", "bookmark", "post"] },
  // });

  // const uniqueTags = await Question.distinct("tags", { _id: { $in: interactedQuestionIds } });

  // filterQuery.tags = { $in: uniqueTags }; // share any tag
  // filterQuery._id = { $nin: interactedQuestionIds }; // exclude interacted
  // filterQuery.author = { $ne: new Types.ObjectId(userId) }; // exclude own questions

  const totalQuestions = await Question.countDocuments(recommendedQuery);
  const questions = await Question.find(recommendedQuery)
    .populate("tags", "name")
    .populate("author", "name image")
    .sort({ upvotes: -1, views: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const isNext = totalQuestions > skip + questions.length;

  return { questions: JSON.parse(JSON.stringify(questions)), isNext };
}
