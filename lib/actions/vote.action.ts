"use server";

import { Answer, Question, Vote } from "@/database";
import action from "../handlers/action";
import handleError from "../handlers/error";
import { UnauthorizedError } from "../http-errors";
import { CreateVoteSchema, HasVotedSchema, UpdateVoteCountSchema } from "../validations";
import mongoose, { ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";
import { createInteraction } from "./interaction.action";
import { after } from "next/server";

async function updateVoteCount(params: UpdateVoteCountParams, session?: ClientSession): Promise<ActionResponse> {
  const validationResult = await action({
    params,
    schema: UpdateVoteCountSchema,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType, voteType, change } = validationResult.params!;

  const Model = targetType === "question" ? Question : Answer;
  const voteField = voteType === "upvote" ? "upvotes" : "downvotes";

  try {
    const result = await Model.findByIdAndUpdate(targetId, { $inc: { [voteField]: change } }, { new: true, session });

    if (!result) throw new Error("Failed to update vote count");

    return { success: true };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}

export async function createVote(params: CreateVoteParams): Promise<ActionResponse> {
  const validationResult = await action({
    params,
    schema: CreateVoteSchema,
    authorize: true,
  });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType, voteType } = validationResult.params!;

  const userId = validationResult.session?.user?.id;

  if (!userId) return handleError(new UnauthorizedError("UserID cannot be found")) as ErrorResponse;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const Model = targetType === "question" ? Question : Answer;
    const contentDoc = await Model.findById(targetId).session(session);
    if (!contentDoc) throw new Error("Content not found");
    const contentAuthorId = contentDoc.author.toString();

    const existingVote = await Vote.findOne({
      author: userId,
      actionId: targetId,
      actionType: targetType,
    }).session(session);

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // if user already voted with same vote type, remove vote
        await Vote.deleteOne({ _id: existingVote._id }).session(session);
        await updateVoteCount({ targetId, targetType, voteType, change: -1 }, session);
      } else {
        // if user has already voted with a different type, update vote type
        await Vote.findByIdAndUpdate(existingVote._id, { voteType }, { new: true, session });
        await updateVoteCount({ targetId, targetType, voteType: existingVote.voteType, change: -1 }, session);
        await updateVoteCount({ targetId, targetType, voteType, change: 1 }, session);
      }
    } else {
      // first time vote creation
      await Vote.create(
        [
          {
            author: userId,
            actionId: targetId,
            actionType: targetType,
            voteType,
          },
        ],
        { session }
      );
      await updateVoteCount({ targetId, targetType, voteType, change: 1 }, session);
    }

    // log the interaction
    after(async () => {
      await createInteraction({
        action: voteType,
        actionId: targetId,
        actionTarget: targetType,
        authorId: contentAuthorId,
      });
    });

    await session.commitTransaction();
    revalidatePath(`/questions/${targetId}`);

    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    session.endSession();
  }
}

export async function hasVoted(params: HasVotedParams): Promise<ActionResponse<HasVotedResponse>> {
  const validationResult = await action({ params, schema: HasVotedSchema, authorize: true });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { targetId, targetType } = validationResult.params!;
  const userId = validationResult.session?.user?.id;

  try {
    const vote = await Vote.findOne({
      author: userId,
      actionId: targetId,
      actionType: targetType,
    });

    if (!vote) {
      return { success: false, data: { hasUpvoted: false, hasDownvoted: false } };
    }

    return {
      success: true,
      data: { hasUpvoted: vote.voteType === "upvote", hasDownvoted: vote.voteType === "downvote" },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
