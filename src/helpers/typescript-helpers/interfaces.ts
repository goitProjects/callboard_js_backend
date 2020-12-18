import { Document } from "mongoose";
import { MongoDBObjectId } from "./types";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  calls: ICall[];
  favourites: ICall[];
  registrationDate: string;
  originUrl?: string;
}

export interface ISession extends Document {
  uid: MongoDBObjectId;
}

export interface IJWTPayload {
  uid: MongoDBObjectId;
  sid: MongoDBObjectId;
}

export interface ICall extends Document {
  title: string;
  imageUrls: string[];
  description: string;
  category: string;
  price: number;
  oldPrice?: number;
  isOnSale: boolean;
  discountPercents?: number;
  phone: string;
  userId: string;
}
