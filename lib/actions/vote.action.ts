"use server";

import { Answer, Question, Vote } from "@/database";
import action from "../handlers/action";
import handleError from "../handlers/error";
import { UnauthorizedError } from "../http-errors";
import { CreateVoteSchema, UpdateVoteCountSchema } from "../validations";
import mongoose, { ClientSession } from "mongoose";
import { revalidatePath } from "next/cache";

export async function updateVoteCount(params: UpdateVoteCountParams, session?: ClientSession): Promise<ActionResponse> {
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
    const result = await Model.findByIdAndUpdate(
      targetId,
      {
        $inc: { [voteField]: change },
      },
      { new: true, session }
    );

    if (!result) {
      return handleError(new Error("Failed to update vote count")) as ErrorResponse;
    }

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

  if (!userId) handleError(new UnauthorizedError("UserID cannot be found")) as ErrorResponse;

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const existingVote = await Vote.findOne({
      author: userId,
      actionId: targetId,
      actionType: targetType,
      voteType,
    }).session(session);

    if (existingVote) {
      if (existingVote.voteType === voteType) {
        // if user already voted with same vote type, remove vote
        await Vote.deleteOne(
          {
            _id: existingVote._id,
          },
          { session }
        );
        updateVoteCount({ targetId, targetType, voteType, change: -1 }, session);
      } else {
        // if user vote on a different type, update vote type
        await Vote.findByIdAndUpdate(
          existingVote._id,
          {
            voteType,
          },
          { new: true, session }
        );
        updateVoteCount({ targetId, targetType, voteType, change: 1 }, session);
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
      updateVoteCount({ targetId, targetType, voteType, change: 1 }, session);
    }

    await session.commitTransaction();
    session.endSession();

    // revalidatePath(`/questions/${targetId}`);

    return { success: true };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    return handleError(error) as ErrorResponse;
  }
}
