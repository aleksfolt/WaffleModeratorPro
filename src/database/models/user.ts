import { Schema, model, type Document } from "mongoose";

export interface IUser extends Document {
  id: number;
  username?: string | null;
  first_name: string;
  last_name?: string | null;
  language_code?: string | null;
  created_at: Date;
  updated_at: Date;
  is_premium: boolean;
}

const UserSchema = new Schema<IUser>(
  {
    id: { type: Number, required: true },
    username: { type: String, default: null },
    first_name: { type: String, required: true, default: "" },
    last_name: { type: String, default: null },
    language_code: { type: String, default: null },
    is_premium: { type: Boolean, required: true, default: false },
  },
  {
    collection: "users",
    id: false,
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
);

UserSchema.index({ id: 1 }, { unique: true });
UserSchema.index({ username: 1 });

export const User = model<IUser>("User", UserSchema);
