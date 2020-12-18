import { Application } from "express";
import mongoose from "mongoose";
import supertest, { Response } from "supertest";
import Server from "../../server/server";
import UserModel from "../user/user.model";
import SessionModel from "../session/session.model";
import { IUser } from "../../helpers/typescript-helpers/interfaces";

describe("User router test suite", () => {
  let app: Application;
  let createdUser: IUser | null;
  let response: Response;
  let accessToken: string;

  beforeAll(async () => {
    app = new Server().startForTesting();
    const url = `mongodb://127.0.0.1/user`;
    await mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    });
    await supertest(app)
      .post("/auth/register")
      .send({ email: "test@email.com", password: "qwerty123" });
    response = await supertest(app)
      .post("/auth/login")
      .send({ email: "test@email.com", password: "qwerty123" });
    accessToken = response.body.accessToken;
  });

  afterAll(async () => {
    await UserModel.deleteOne({ email: response.body.user.email });
    await SessionModel.deleteOne({ _id: response.body.sid });
    await mongoose.connection.close();
  });

  describe("GET /user", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .get("/user")
          .set("Authorization", `Bearer ${accessToken}`);
        createdUser = await UserModel.findOne({
          email: "test@email.com",
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          email: (createdUser as IUser).email,
          registrationDate: (createdUser as IUser).registrationDate,
          id: (createdUser as IUser)._id.toString(),
          calls: (createdUser as IUser).calls,
          favourites: (createdUser as IUser).favourites,
        });
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).get("/user");
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that token wasn't provided", () => {
        expect(response.body.message).toBe("No token provided");
      });
    });

    context("With invalid 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .get("/user")
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should return an unauthorized status", () => {
        expect(response.body.message).toBe("Unauthorized");
      });
    });
  });

  describe("GET /user/{userId}", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get(
          `/user/${(createdUser as IUser)._id}`
        );
        createdUser = await UserModel.findOne({
          email: "test@email.com",
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          email: (createdUser as IUser).email,
          registrationDate: (createdUser as IUser).registrationDate,
        });
      });
    });

    context("With invalid 'userId'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .get("/user/qwerty123")
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'userId' is invalid", () => {
        expect(response.body.message).toBe(
          "Invalid 'userId'. Must be a MongoDB ObjectId"
        );
      });
    });
  });
});
