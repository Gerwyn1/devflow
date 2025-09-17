import { Interaction, User } from "@/database";
import action from "../handlers/action";
import handleError from "../handlers/error";
import { CreateInteractionSchema } from "../validations";
import mongoose from "mongoose";
import { IInteractionDoc } from "@/database/interaction.model";

export const createInteraction = async (params: CreateInteractionParams): Promise<ActionResponse<IInteractionDoc>> => {
  const validationResult = await action({ params, schema: CreateInteractionSchema, authorize: true });

  if (validationResult instanceof Error) {
    return handleError(validationResult) as ErrorResponse;
  }

  const userId = validationResult.session?.user?.id;
  const { action: actionType, actionId, actionTarget, authorId } = validationResult.params!;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [interaction] = await Interaction.create(
      [
        {
          action: actionType,
          actionId,
          actionType: actionTarget,
          user: userId,
        },
      ],
      { session }
    );

    // Update reputation for both the performer and the content author
    await updateReputation({ interaction, session, performerId: userId!, authorId });

    await session.commitTransaction();

    return {
      success: true,
      status: 200,
      data: JSON.parse(JSON.stringify(interaction)),
    };
  } catch (error) {
    await session.abortTransaction();
    return handleError(error) as ErrorResponse;
  } finally {
    await session.endSession();
  }
};

async function updateReputation(params: UpdateReputationParams) {
  const { interaction, session, performerId, authorId } = params;
  const { action, actionType } = interaction;

  let performerPoints = 0;
  let authorPoints = 0;

  switch (action) {
    case "upvote":
      performerPoints = 2;
      authorPoints = 10;
      break;
    case "downvote":
      performerPoints = -1;
      authorPoints = -2;
      break;
    case "post":
      authorPoints = actionType === "question" ? 5 : 10;
      break;
    case "delete":
      authorPoints = actionType === "question" ? -5 : -10;
      break;
  }

  if (performerId === authorId) {
    await User.findByIdAndUpdate(performerId, { $inc: { reputation: authorPoints } }, { session });

    return;
  }

  await User.bulkWrite(
    [
      {
        updateOne: {
          filter: { _id: performerId },
          update: { $inc: { reputation: performerPoints } },
        },
      },
      {
        updateOne: {
          filter: { _id: authorId },
          update: { $inc: { reputation: authorPoints } },
        },
      },
    ],
    { session }
  );
}

// ALTERNATE WAY: Process 1 request at a time (increases latency & could create performance bottlenecks under high load)
//   await User.findByIdAndUpdate(performerId, { $inc: { reputation: performerPoints } }, { session });
//   await User.findByIdAndUpdate(authorId, { $inc: { reputation: authorPoints } }, { session });
// }

// ALTERNATE WAY: Parallel DB calls: fire both DB operations in parallel (slightly faster)
// cons: one might succeed but the other might fail. also, still making multiple requests to DB
// await Promise.all([
//   User.findByIdAndUpdate(performerId, { $inc: { reputation: performerPoints } }, { session }),
//   User.findByIdAndUpdate(authorId, { $inc: { reputation: authorPoints } }, { session }),
// ]);

// Most efficient way (recommended): Bulk Write Operations

// More advanced approaches : MongoDB's $cond operator (aggregation pipelines)
