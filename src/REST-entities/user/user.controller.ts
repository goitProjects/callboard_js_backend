import { Request, Response } from "express";
import { IUser } from "../../helpers/typescript-helpers/interfaces";
import UserModel from "./user.model";

export const getAllInfo = (req: Request, res: Response) => {
  const user = req.user;
  res.status(200).send({
    email: (user as IUser).email,
    registrationDate: (user as IUser).registrationDate,
    id: (user as IUser)._id,
    calls: (user as IUser).calls,
    favourites: (user as IUser).favourites,
  });
};

export const getAllInfoById = async (req: Request, res: Response) => {
  const { userId } = req.params;
  const user = await UserModel.findById(userId);
  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }
  res.status(200).send({
    email: (user as IUser).email,
    registrationDate: (user as IUser).registrationDate,
  });
};
