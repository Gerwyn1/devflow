"use server";

import { Collection, Question } from "@/database";
import action from "../handlers/action";
import handleError from "../handlers/error";
import { CollectionBaseSchema } from "../validations";
import { NotFoundError } from "../http-errors";
import { revalidatePath } from "next/cache";
import ROUTES from "@/constants/routes";

export async function toggleSaveQuestion(params: CollectionBaseParams): Promise<ActionResponse<{ saved: boolean }>> {
  const validationResult = await action({
    params,
    schema: CollectionBaseSchema,
    authorize: true,
  });
  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const { questionId } = validationResult.params!;
  const userId = validationResult.session?.user?.id;

  const question = await Question.findById(questionId);

  if (!question) throw new NotFoundError("Question");

  try {
    const collection = await Collection.findOne({
      question: questionId,
      author: userId,
    });

    if (collection) {
      // To escape additional DB call:
      // if (collection) { await collection.deleteOne() return { success: true, data: { saved: false } } }

      await Collection.findByIdAndDelete(collection._id);

      revalidatePath(ROUTES.QUESTION(questionId));

      return {
        success: true,
        data: {
          saved: false,
        },
      };
    }

    await Collection.create({
      question: questionId,
      author: userId,
    });

    revalidatePath(ROUTES.QUESTION(questionId));

    return {
      success: true,
      data: {
        saved: true,
      },
    };
  } catch (error) {
    return handleError(error) as ErrorResponse;
  }
}
