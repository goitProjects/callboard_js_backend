import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as queryString from "query-string";
import axios from "axios";
import UserModel from "../REST-entities/user/user.model";
import SessionModel from "../REST-entities/session/session.model";
import {
  ISession,
  IJWTPayload,
} from "../helpers/typescript-helpers/interfaces";

export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const existingUser = await UserModel.findOne({ email });
  if (existingUser) {
    return res
      .status(409)
      .send({ message: `User with ${email} email already exists` });
  }
  const passwordHash = await bcrypt.hash(
    password,
    Number(process.env.HASH_POWER)
  );
  const today = new Date();
  const newUser = await UserModel.create({
    email,
    passwordHash,
    favourites: [],
    calls: [],
    registrationDate: `${today.getFullYear()}-${
      today.getMonth() + 1
    }-${today.getDate()}`,
    originUrl: req.headers.origin,
  });
  return res.status(201).send({
    email,
    registrationDate: newUser.registrationDate,
    id: newUser._id,
  });
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await UserModel.findOne({ email });
  if (!user) {
    return res
      .status(403)
      .send({ message: `User with ${email} email doesn't exist` });
  }
  const isPasswordCorrect = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordCorrect) {
    return res.status(403).send({ message: "Password is wrong" });
  }
  const newSession = await SessionModel.create({
    uid: user._id,
  });
  const accessToken = jwt.sign(
    { uid: user._id, sid: newSession._id },
    process.env.JWT_ACCESS_SECRET as string,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRE_TIME,
    }
  );
  const refreshToken = jwt.sign(
    { uid: user._id, sid: newSession._id },
    process.env.JWT_REFRESH_SECRET as string,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE_TIME,
    }
  );
  return res.status(200).send({
    accessToken,
    refreshToken,
    sid: newSession._id,
    user: {
      email: user.email,
      registrationDate: user.registrationDate,
      id: user._id,
      favourites: user.favourites,
      calls: user.calls,
    },
  });
};

export const authorize = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authorizationHeader = req.get("Authorization");
  if (authorizationHeader) {
    const accessToken = authorizationHeader.replace("Bearer ", "");
    let payload: string | object;
    try {
      payload = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET as string);
    } catch (err) {
      return res.status(401).send({ message: "Unauthorized" });
    }
    const user = await UserModel.findById((payload as IJWTPayload).uid);
    const session = await SessionModel.findById((payload as IJWTPayload).sid);
    if (!user) {
      return res.status(404).send({ message: "Invalid user" });
    }
    if (!session) {
      return res.status(404).send({ message: "Invalid session" });
    }
    req.user = user;
    req.session = session;
    next();
  } else return res.status(400).send({ message: "No token provided" });
};

export const refreshTokens = async (req: Request, res: Response) => {
  const authorizationHeader = req.get("Authorization");
  if (authorizationHeader) {
    const activeSession = await SessionModel.findById(req.body.sid);
    if (!activeSession) {
      return res.status(404).send({ message: "Invalid session" });
    }
    const reqRefreshToken = authorizationHeader.replace("Bearer ", "");
    let payload: string | object;
    try {
      payload = jwt.verify(reqRefreshToken, process.env.JWT_REFRESH_SECRET as string);
    } catch (err) {
      await SessionModel.findByIdAndDelete(req.body.sid);
      return res.status(401).send({ message: "Unauthorized" });
    }
    const user = await UserModel.findById((payload as IJWTPayload).uid);
    const session = await SessionModel.findById((payload as IJWTPayload).sid);
    if (!user) {
      return res.status(404).send({ message: "Invalid user" });
    }
    if (!session) {
      return res.status(404).send({ message: "Invalid session" });
    }
    await SessionModel.findByIdAndDelete((payload as IJWTPayload).sid);
    const newSession = await SessionModel.create({
      uid: user._id,
    });
    const newAccessToken = jwt.sign(
      { uid: user._id, sid: newSession._id },
      process.env.JWT_ACCESS_SECRET as string,
      {
        expiresIn: process.env.JWT_ACCESS_EXPIRE_TIME,
      }
    );
    const newRefreshToken = jwt.sign(
      { uid: user._id, sid: newSession._id },
      process.env.JWT_REFRESH_SECRET as string,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE_TIME }
    );
    return res
      .status(200)
      .send({ newAccessToken, newRefreshToken, newSid: newSession._id });
  }
  return res.status(400).send({ message: "No token provided" });
};

export const logout = async (req: Request, res: Response) => {
  const currentSession = req.session;
  await SessionModel.deleteOne({ _id: (currentSession as ISession)._id });
  return res.status(204).end();
};

export const googleAuth = async (req: Request, res: Response) => {
  const stringifiedParams = queryString.stringify({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${process.env.BASE_URL}/auth/google-redirect`,
    scope: ["https://www.googleapis.com/auth/userinfo.email"].join(" "),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  return res.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${stringifiedParams}`
  );
};

export const googleRedirect = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const urlObj = new URL(fullUrl);
  const urlParams = queryString.parse(urlObj.search);
  const code = urlParams.code;
  const tokenData = await axios({
    url: `https://oauth2.googleapis.com/token`,
    method: "post",
    data: {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${process.env.BASE_URL}/auth/google-redirect`,
      grant_type: "authorization_code",
      code,
    },
  });
  const userData = await axios({
    url: "https://www.googleapis.com/oauth2/v2/userinfo",
    method: "get",
    headers: {
      Authorization: `Bearer ${tokenData.data.access_token}`,
    },
  });
  let existingUser = await UserModel.findOne({ email: userData.data.email });
  if (!existingUser || !existingUser.originUrl) {
    return res.status(403).send({
      message:
        "You should register from front-end first (not postman). Google is only for sign-in",
    });
  }
  const newSession = await SessionModel.create({
    uid: existingUser._id,
  });
  const accessToken = jwt.sign(
    { uid: existingUser._id, sid: newSession._id },
    process.env.JWT_ACCESS_SECRET as string,
    {
      expiresIn: process.env.JWT_ACCESS_EXPIRE_TIME,
    }
  );
  const refreshToken = jwt.sign(
    { uid: existingUser._id, sid: newSession._id },
    process.env.JWT_REFRESH_SECRET as string,
    {
      expiresIn: process.env.JWT_REFRESH_EXPIRE_TIME,
    }
  );
  return res.redirect(
    `${existingUser.originUrl}?accessToken=${accessToken}&refreshToken=${refreshToken}&sid=${newSession._id}`
  );
};
