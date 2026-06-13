import { User, type IUser } from "../models/user.ts";

export type UserCreateData = {
  id: number;
  first_name: string;
  username?: string | null;
  last_name?: string | null;
  language_code?: string | null;
  is_premium?: boolean;
};

export type UserUpdateData = Partial<Omit<UserCreateData, "id">>;

export type UserUpsertData = {
  id: number;
} & UserUpdateData;

export class UserService {
  async create(data: UserCreateData): Promise<IUser> {
    return User.create(this.normalizeUserData(data));
  }

  async getById(id: number): Promise<IUser | null> {
    return User.findOne({ id });
  }

  async getByUsername(username: string): Promise<IUser | null> {
    const normalizedUsername = this.normalizeUsername(username);

    if (!normalizedUsername) {
      return null;
    }

    return User.findOne({ username: normalizedUsername });
  }

  async getByIds(ids: number[]): Promise<IUser[]> {
    return User.find({ id: { $in: ids } });
  }

  async update(id: number, data: UserUpdateData): Promise<IUser | null> {
    return User.findOneAndUpdate(
      { id },
      { $set: this.normalizeUserData(data) },
      { returnDocument: "after", runValidators: true },
    );
  }

  async upsert(data: UserUpsertData): Promise<IUser> {
    return User.findOneAndUpdate(
      { id: data.id },
      { $set: this.normalizeUserData(data) },
      {
        returnDocument: "after",
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).orFail();
  }

  async delete(id: number): Promise<boolean> {
    const result = await User.deleteOne({ id });

    return result.deletedCount === 1;
  }

  async exists(id: number): Promise<boolean> {
    const user = await User.exists({ id });

    return Boolean(user);
  }

  private normalizeUserData<T extends Partial<UserCreateData>>(data: T): T {
    const normalized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) {
        continue;
      }

      normalized[key] = key === "username" ? this.normalizeUsername(value as string | null) : value;
    }

    return normalized as T;
  }

  private normalizeUsername(username?: string | null): string | null {
    const normalized = username?.trim().replace(/^@/, "");

    return normalized ? normalized : null;
  }
}

export const userService = new UserService();
