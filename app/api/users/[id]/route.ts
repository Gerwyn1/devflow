import User from "@/database/user.model";
import handleError from "@/lib/handlers/error";
import { NotFoundError, ValidationError } from "@/lib/http-errors";
import dbConnect from "@/lib/mongoose";
import { UserSchema } from "@/lib/validations";
import { NextResponse } from "next/server";

// GET /api/users/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    throw new NotFoundError("User");
  }

  try {
    await dbConnect();
    const user = await User.findById(id);

    if (!user) {
      throw new NotFoundError("User");
    }

    return NextResponse.json({ success: true, data: user }, { status: 200 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

// DELETE /api/users/[id]
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    throw new NotFoundError("User");
  }

  try {
    await dbConnect();
    const user = await User.findByIdAndDelete(id);

    if (!user) {
      throw new NotFoundError("User");
    }

    return NextResponse.json({ success: true, data: user }, { status: 200 }); // 204 if no data/content is returned or excluded
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

// PUT /api/users/[id]
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!id) {
    throw new NotFoundError("User");
  }

  try {
    await dbConnect();

    const body = await request.json();

    const validatedData = UserSchema.partial().safeParse(body);

    if (!validatedData.success) {
      throw new ValidationError(validatedData.error.flatten().fieldErrors);
    }

    const updatedUser = await User.findByIdAndUpdate(id, validatedData, { new: true });

    if (!updatedUser) {
      throw new NotFoundError("User");
    }

    return NextResponse.json({ success: true, data: updatedUser }, { status: 201 });
  } catch (error) {
    return handleError(error, "api") as APIErrorResponse;
  }
}

// Public endpoints -> /api/v1/...