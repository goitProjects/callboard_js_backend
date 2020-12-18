import mongoose, { Schema } from "mongoose";
import { callSchema } from "../call/call.model";
import { IUser } from "../../helpers/typescript-helpers/interfaces";

const userSchema = new Schema({
  email: String,
  passwordHash: String,
  calls: [callSchema],
  favourites: [callSchema],
  registrationDate: String,
  originUrl: String,
});

export default mongoose.model<IUser>("User", userSchema);
