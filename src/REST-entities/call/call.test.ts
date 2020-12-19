import { Application } from "express";
import mongoose from "mongoose";
import supertest, { Response } from "supertest";
import path from "path";
import Server from "../../server/server";
import { IUser, ICall } from "../../helpers/typescript-helpers/interfaces";
import { Categories } from "./../../helpers/typescript-helpers/enums";
import UserModel from "../../REST-entities/user/user.model";
import SessionModel from "../session/session.model";
import CallModel from "./call.model";

describe("Call router test suite", () => {
  let app: Application;
  let response: Response;
  let secondResponse: Response;
  let createdUser: IUser | null;
  let createdCall: ICall | null;
  let accessToken: string;
  let secondAccessToken: string;

  beforeAll(async () => {
    app = new Server().startForTesting();
    const url = `mongodb://127.0.0.1/call`;
    await mongoose.connect(url, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false,
      useCreateIndex: true,
    });
    await supertest(app)
      .post("/auth/register")
      .send({ email: "test@email.com", password: "qwerty123" });
    await supertest(app)
      .post("/auth/register")
      .send({ email: "testt@email.com", password: "qwerty123" });
    response = await supertest(app)
      .post("/auth/login")
      .send({ email: "test@email.com", password: "qwerty123" });
    secondResponse = await supertest(app)
      .post("/auth/login")
      .send({ email: "testt@email.com", password: "qwerty123" });
    accessToken = response.body.accessToken;
    secondAccessToken = secondResponse.body.accessToken;
    createdUser = await UserModel.findById(response.body.user.id);
  });

  afterAll(async () => {
    await UserModel.deleteOne({ _id: response.body.user.id });
    await UserModel.deleteOne({ _id: secondResponse.body.user.id });
    await SessionModel.deleteOne({ _id: response.body.sid });
    await SessionModel.deleteOne({ _id: secondResponse.body.sid });
    await mongoose.connection.close();
  });

  describe("POST /call", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"))
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
        createdCall = await CallModel.findOne({
          userId: (createdUser as IUser)._id,
        }).lean();
        createdUser = await UserModel.findOne({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 201 status code", () => {
        expect(response.status).toBe(201);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          title: "Test",
          description: "Test",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000000",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          id: (createdCall as ICall)._id.toString(),
          userId: (createdUser as IUser)._id.toString(),
        });
      });

      it("Should create 2 images", () => {
        expect(response.body.imageUrls.length).toBe(2);
      });

      it("Should add new call to user's calls in DB", () => {
        expect((createdUser as IUser).calls[0]).toEqual({
          title: "Test",
          description: "Test",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000000",
          isOnSale: false,
          imageUrls: (createdCall as ICall).imageUrls,
          userId: (createdUser as IUser)._id,
          _id: (createdUser as IUser).calls[0]._id,
          __v: 0,
        });
      });
    });

    context("Invalid request (images are not provided)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000");
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that no images were provided", () => {
        expect(response.body.message).toEqual("No images provided");
      });
    });

    context(
      "Invalid request ('price' is not 0, while category is 'free')",
      () => {
        beforeAll(async () => {
          response = await supertest(app)
            .post("/call")
            .set("Authorization", `Bearer ${accessToken}`)
            .field("title", "Test")
            .field("description", "Test")
            .field("category", Categories.FREE)
            .field("price", 2)
            .field("phone", "+380000000000")
            .attach("file", path.join(__dirname, "./test-files/test.jpg"));
        });

        it("Should return a 400 status code", () => {
          expect(response.status).toBe(400);
        });

        it("Should say that price for this category must be 0", () => {
          expect(response.body.message).toEqual(
            `Can't set price for ${Categories.FREE} category. Must be 0`
          );
        });
      }
    );

    context("Invalid request ('title' is not provided)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'title' is required", () => {
        expect(response.body.message).toEqual('"title" is required');
      });
    });

    context("Invalid request ('file' is txt file)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.txt"));
      });

      it("Should return a 415 status code", () => {
        expect(response.status).toBe(415);
      });

      it("Should say that only image files are allowed", () => {
        expect(response.body.message).toEqual("Only image files are allowed");
      });
    });

    context("Invalid request ('price' is negative)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", -1)
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'price' must be greater than or equal to 0", () => {
        expect(response.body.message).toEqual(
          '"price" must be greater than or equal to 0'
        );
      });
    });

    context("Invalid request ('price' not a number)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", [1, 2, 3])
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'price' must be a number", () => {
        expect(response.body.message).toEqual('"price" must be a number');
      });
    });

    context("Invalid request (invalid 'phone' format)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+38000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'phone' has an invalid format", () => {
        expect(response.body.message).toEqual(
          "Invalid 'phone'. Please, use +380000000000 format"
        );
      });
    });

    context("Invalid request ('category' is invalid)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", "qwerty123")
          .field("price", 2)
          .field("phone", "+380000000000")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'category' must be an enum member", () => {
        expect(response.body.message).toEqual(
          '"category" must be one of [business and services, electronics, free, property, recreation and sport, trade, transport, work]'
        );
      });
    });

    context("Invalid request (extra field)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer ${accessToken}`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000")
          .field("extra", "")
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'extra' is not allowed", () => {
        expect(response.body.message).toEqual('"extra" is not allowed');
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000");
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say token wasn't provided", () => {
        expect(response.body.message).toEqual("No token provided");
      });
    });

    context("With invalid 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post("/call")
          .set("Authorization", `Bearer qwerty123`)
          .field("title", "Test")
          .field("description", "Test")
          .field("category", Categories.TRANSPORT)
          .field("price", 2)
          .field("phone", "+380000000000");
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should say token wasn't provided", () => {
        expect(response.body.message).toEqual("Unauthorized");
      });
    });
  });

  describe("POST /call/favourite/{callId}", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`);
        createdUser = await UserModel.findById({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          newFavourites: (createdUser as IUser).favourites.map((call) => {
            (call._id = call._id.toString()),
              (call.userId = call.userId.toString());
            return call;
          }),
        });
      });

      it("Should add to user's favourites in DB", () => {
        expect((createdUser as IUser).favourites[0]).toEqual({
          title: "Test",
          description: "Test",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000000",
          isOnSale: false,
          imageUrls: (createdCall as ICall).imageUrls,
          userId: (createdUser as IUser)._id.toString(),
          _id: (createdUser as IUser).calls[0]._id.toString(),
          __v: 0,
        });
      });
    });

    context("Adding already favourited call to favourites", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`);
      });

      it("Should return a 403 status code", () => {
        expect(response.status).toBe(403);
      });

      it("Should say that it's already in favourites", () => {
        expect(response.body.message).toBe("Already in favourites");
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).post(
          `/call/favourite/${(createdCall as ICall)._id}`
        );
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
          .post(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should return an unauthorized status", () => {
        expect(response.body.message).toBe("Unauthorized");
      });
    });

    context("With invalid 'callId'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .post(`/call/favourite/qwerty123`)
          .set("Authorization", `Bearer ${accessToken}`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'callId' is invalid", () => {
        expect(response.body.message).toBe(
          "Invalid 'callId'. Must be a MongoDB ObjectId"
        );
      });
    });
  });

  describe("GET /call/favourites", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .get(`/call/favourites`)
          .set("Authorization", `Bearer ${accessToken}`);
        createdUser = await UserModel.findById({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          favourites: (createdUser as IUser).favourites.map((call) => {
            (call._id = call._id.toString()),
              (call.userId = call.userId.toString());
            return call;
          }),
        });
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call/favourites`);
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
          .get(`/call/favourites`)
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

  describe("DELETE /call/favourite/{callId}", () => {
    let response: Response;

    context("With another account", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${secondAccessToken}`);
      });

      it("Should return a 403 status code", () => {
        expect(response.status).toBe(403);
      });

      it("Should say that call is not in favourites", () => {
        expect(response.body.message).toBe("Not in favourites");
      });
    });

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`);
        createdUser = await UserModel.findById({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          newFavourites: (createdUser as IUser).favourites.map((call) => {
            (call._id = call._id.toString()),
              (call.userId = call.userId.toString());
            return call;
          }),
        });
      });

      it("Should delete from user's favourites in DB", () => {
        expect((createdUser as IUser).favourites[0]).toEqual(undefined);
      });
    });

    context("Deleting an already deleted call from favourites", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`);
      });

      it("Should return a 403 status code", () => {
        expect(response.status).toBe(403);
      });

      it("Should say that it's not in favourites", () => {
        expect(response.body.message).toBe("Not in favourites");
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).delete(
          `/call/favourite/${(createdCall as ICall)._id}`
        );
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
          .delete(`/call/favourite/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should return an unauthorized status", () => {
        expect(response.body.message).toBe("Unauthorized");
      });
    });

    context("With invalid 'callId'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/favourite/qwerty123`)
          .set("Authorization", `Bearer ${accessToken}`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'callId' is invalid", () => {
        expect(response.body.message).toBe(
          "Invalid 'callId'. Must be a MongoDB ObjectId"
        );
      });
    });
  });

  describe("PATCH /call/{callId}", () => {
    let response: Response;
    let freeCall: Response;

    const validReqBody = {
      title: "Test2",
      description: "Test2",
      category: Categories.TRANSPORT,
      phone: "+380000000001",
    };

    const secondValidReqBody = {
      price: 4,
    };

    const invalidReqBody = {
      price: -1,
    };

    const secondInvalidReqBody = {
      price: {},
    };

    const thirdInvalidReqBody = {
      price: 2,
      extra: "",
    };

    const fourthInvalidReqBody = {
      price: 2,
      category: Categories.WORK,
    };

    const fifthInvalidReqBody = {
      price: 2,
      category: "qwerty123",
    };

    const sixthInvalidReqBody = {
      price: 2,
      phone: "qwerty123",
    };

    const seventhInvalidReqBody = {
      price: 1,
    };

    context("With validReqBody", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(validReqBody);
        createdCall = await CallModel.findOne({
          _id: (createdCall as ICall)._id,
        }).lean();
        createdUser = await UserModel.findOne({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          id: (createdCall as ICall)._id.toString(),
          userId: (createdUser as IUser)._id.toString(),
        });
      });

      it("Should update call in DB", () => {
        expect(createdCall as ICall).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });

      it("Should update call in user's call in DB", () => {
        expect((createdUser as IUser).calls[0]).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 2,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });
    });

    context("With secondValidReqBody", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(secondValidReqBody);
        createdCall = await CallModel.findOne({
          _id: (createdCall as ICall)._id,
        }).lean();
        createdUser = await UserModel.findOne({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 4,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          discountPercents: 0,
          oldPrice: 2,
          id: (createdCall as ICall)._id.toString(),
          userId: (createdUser as IUser)._id.toString(),
        });
      });

      it("Should update call in DB", () => {
        expect(createdCall as ICall).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 4,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          discountPercents: 0,
          oldPrice: 2,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });

      it("Should update call in user's call in DB", () => {
        expect((createdUser as IUser).calls[0]).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 4,
          phone: "+380000000001",
          isOnSale: false,
          imageUrls: response.body.imageUrls,
          discountPercents: 0,
          oldPrice: 2,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });
    });

    context("With image", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .field("price", 1)
          .attach("file", path.join(__dirname, "./test-files/test.jpg"));
        createdCall = await CallModel.findOne({
          _id: (createdCall as ICall)._id,
        }).lean();
        createdUser = await UserModel.findOne({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 1,
          phone: "+380000000001",
          isOnSale: true,
          oldPrice: 4,
          discountPercents: 75,
          imageUrls: response.body.imageUrls,
          id: (createdCall as ICall)._id.toString(),
          userId: (createdUser as IUser)._id.toString(),
        });
      });

      it("Should update call in DB", () => {
        expect(createdCall as ICall).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 1,
          phone: "+380000000001",
          isOnSale: true,
          oldPrice: 4,
          discountPercents: 75,
          imageUrls: response.body.imageUrls,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });

      it("Should update call in user's call in DB", () => {
        expect((createdUser as IUser).calls[0]).toEqual({
          title: "Test2",
          description: "Test2",
          category: Categories.TRANSPORT,
          price: 1,
          phone: "+380000000001",
          isOnSale: true,
          oldPrice: 4,
          discountPercents: 75,
          imageUrls: response.body.imageUrls,
          _id: (createdCall as ICall)._id,
          userId: (createdUser as IUser)._id,
          __v: 0,
        });
      });

      it("Should update images", () => {
        expect((createdCall as ICall).imageUrls.length).toBe(1);
      });
    });

    context("With invalidReqBody ('price' is negative)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(invalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'price' must be greater than or equal to 0", () => {
        expect(response.body.message).toBe(
          '"price" must be greater than or equal to 0'
        );
      });
    });

    context(
      `Invalid request (changing price for call from ${Categories.FREE} category)`,
      () => {
        beforeAll(async () => {
          freeCall = await supertest(app)
            .post("/call")
            .set("Authorization", `Bearer ${accessToken}`)
            .field("title", "Test")
            .field("description", "Test")
            .field("category", Categories.FREE)
            .field("price", 0)
            .field("phone", "+380000000000")
            .attach("file", path.join(__dirname, "./test-files/test.jpg"));
          response = await supertest(app)
            .patch(`/call/${freeCall.body.id}`)
            .set("Authorization", `Bearer ${accessToken}`)
            .send(secondValidReqBody);
        });

        afterAll(async () => {
          await CallModel.deleteOne({ _id: freeCall.body.id });
        });

        it("Should return a 400 status code", () => {
          expect(response.status).toBe(400);
        });

        it(`Should say that price cannot be changed for a call from ${Categories.FREE} category`, () => {
          expect(response.body.message).toBe(
            `Can't set price for ${Categories.FREE} category. Must be 0`
          );
        });
      }
    );

    context("With secondInvalidReqBody ('price' is not a number)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(secondInvalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'price' must be a number", () => {
        expect(response.body.message).toBe('"price" must be a number');
      });
    });

    context("With thirdInvalidReqBody (extra field provided)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(thirdInvalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'extra' is not allowed", () => {
        expect(response.body.message).toBe('"extra" is not allowed');
      });
    });

    context(
      "With fourthInvalidReqBody (setting 'price' with 'work' category)",
      () => {
        beforeAll(async () => {
          response = await supertest(app)
            .patch(`/call/${(createdCall as ICall)._id}`)
            .set("Authorization", `Bearer ${accessToken}`)
            .send(fourthInvalidReqBody);
        });

        it("Should return a 400 status code", () => {
          expect(response.status).toBe(400);
        });

        it("Should say that 'price' can't be set with new 'work' category", () => {
          expect(response.body.message).toBe(
            `Can't set price for ${Categories.WORK} category. Must be 0`
          );
        });
      }
    );

    context("With fifthInvalidReqBody (invalid 'category')", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(fifthInvalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'category' is invalid", () => {
        expect(response.body.message).toBe(
          '"category" must be one of [business and services, electronics, free, property, recreation and sport, trade, transport, work]'
        );
      });
    });

    context("With sixthInvalidReqBody (invalid 'phone' format)", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(sixthInvalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'category' is invalid", () => {
        expect(response.body.message).toBe(
          "Invalid 'phone'. Please, use +380000000000 format"
        );
      });
    });

    context("With seventhInvalidReqBody (setting the same 'price')", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(seventhInvalidReqBody);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that same 'price' cannot be set", () => {
        expect(response.body.message).toBe("Can't set the same price");
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .send(validReqBody);
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
          .patch(`/call/${(createdCall as ICall)._id}`)
          .send(validReqBody)
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should return an unauthorized status", () => {
        expect(response.body.message).toBe("Unauthorized");
      });
    });

    context("With another account", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .patch(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${secondAccessToken}`)
          .send(validReqBody);
      });

      it("Should return a 404 status code", () => {
        expect(response.status).toBe(404);
      });

      it("Should say that call wasn't found", () => {
        expect(response.body.message).toEqual("Call not found");
      });
    });
  });

  describe("GET /call/own", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .get(`/call/own`)
          .set("Authorization", `Bearer ${accessToken}`);
        createdUser = await UserModel.findById({
          _id: (createdUser as IUser)._id,
        }).lean();
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          favourites: (createdUser as IUser).calls.map((call) => {
            (call._id = call._id.toString()),
              (call.userId = call.userId.toString());
            return call;
          }),
        });
      });
    });

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call/own`);
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
          .get(`/call/own`)
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

  describe("GET /call/find", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get("/call/find?search=test");
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual([
          {
            title: "Test2",
            description: "Test2",
            category: Categories.TRANSPORT,
            price: 1,
            phone: "+380000000001",
            isOnSale: true,
            oldPrice: 4,
            discountPercents: 75,
            imageUrls: response.body[0].imageUrls,
            _id: (createdCall as ICall)._id.toString(),
            userId: (createdUser as IUser)._id.toString(),
            __v: 0,
          },
        ]);
      });
    });

    context("Without providing query", () => {
      beforeAll(async () => {
        response = await supertest(app).get("/call/find");
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'search' is required", () => {
        expect(response.body.message).toBe('"search" is required');
      });
    });
  });

  describe("GET /call/specific/{category}", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get("/call/specific/transport");
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual([
          {
            title: "Test2",
            description: "Test2",
            category: Categories.TRANSPORT,
            price: 1,
            phone: "+380000000001",
            isOnSale: true,
            oldPrice: 4,
            discountPercents: 75,
            imageUrls: response.body[0].imageUrls,
            _id: (createdCall as ICall)._id.toString(),
            userId: (createdUser as IUser)._id.toString(),
            __v: 0,
          },
        ]);
      });
    });

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get("/call/specific/trade");
      });

      it("Should return a 404 status code", () => {
        expect(response.status).toBe(404);
      });

      it("Should return an expected result", () => {
        expect(response.body.message).toEqual("No calls found");
      });
    });
  });

  describe("DELETE /call/:callId", () => {
    let response: Response;
    let deletedCall: ICall | null;

    context("Without providing 'accessToken'", () => {
      beforeAll(async () => {
        response = await supertest(app).delete(
          `/call/${(createdCall as ICall)._id}`
        );
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
          .delete(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer qwerty123`);
      });

      it("Should return a 401 status code", () => {
        expect(response.status).toBe(401);
      });

      it("Should return an unauthorized status", () => {
        expect(response.body.message).toBe("Unauthorized");
      });
    });

    context("With invalid 'callId'", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete("/call/qwerty123")
          .set("Authorization", `Bearer ${accessToken}`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'callId' is invalid", () => {
        expect(response.body.message).toBe(
          "Invalid 'callId'. Must be a MongoDB ObjectId"
        );
      });
    });

    context("With another account", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${secondAccessToken}`);
      });

      it("Should return a 404 status code", () => {
        expect(response.status).toBe(404);
      });

      it("Should say that call wasn't found", () => {
        expect(response.body.message).toBe("Call not found");
      });
    });

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app)
          .delete(`/call/${(createdCall as ICall)._id}`)
          .set("Authorization", `Bearer ${accessToken}`);
        deletedCall = await CallModel.findOne({
          _id: (createdCall as ICall)._id,
        });
        createdUser = await UserModel.findOne({
          _id: (createdUser as IUser)._id,
        });
      });

      it("Should return a 204 status code", () => {
        expect(response.status).toBe(204);
      });

      it("Should delete call from DB", () => {
        expect(deletedCall).toBeFalsy();
      });

      it("Should delete call from user's calls", () => {
        expect(
          (createdUser as IUser).calls.find(
            (call) =>
              call._id.toString() === (createdCall as ICall)._id.toString()
          )
        ).toBeFalsy();
      });
    });
  });

  describe("GET /call?page={page}", () => {
    let response: Response;
    let sales: ICall[] | null;
    let recreationAndSport: ICall[] | null;
    let free: ICall[] | null;
    let businessAndServices: ICall[] | null;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call?page=1`);
        sales = await CallModel.find({ isOnSale: true });
        recreationAndSport = await CallModel.find({
          category: Categories.RECREATION_AND_SPORT,
        });
        free = await CallModel.find({
          category: Categories.FREE,
        });
        businessAndServices = await CallModel.find({
          category: Categories.BUSINESS_AND_SERVICES,
        });
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual({
          sales,
          recreationAndSport,
          free,
          businessAndServices,
        });
      });
    });

    context("Invalid request (no query provided)", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that query wasn't provided", () => {
        expect(response.body.message).toBe('"page" is required');
      });
    });

    context("Invalid request ('page' is invalid)", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call?page=0`);
      });

      it("Should return a 400 status code", () => {
        expect(response.status).toBe(400);
      });

      it("Should say that 'page' must be below 3 and greater than 1", () => {
        expect(response.body.message).toBe(
          '"page" must be greater than or equal to 1'
        );
      });
    });
  });

  describe("GET /call/categories", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call/categories`);
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual([
          "property",
          "transport",
          "work",
          "electronics",
          "business and services",
          "recreation and sport",
          "free",
          "trade",
        ]);
      });
    });
  });

  describe("GET /call/russian-categories", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call/russian-categories`);
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual([
          "Недвижимость",
          "Транспорт",
          "Работа",
          "Электроника",
          "Бизнес и услуги",
          "Отдых и спорт",
          "Отдам бесплатно",
          "Обмен",
        ]);
      });
    });
  });

  describe("GET /call/ads", () => {
    let response: Response;

    context("Valid request", () => {
      beforeAll(async () => {
        response = await supertest(app).get(`/call/ads`);
      });

      it("Should return a 200 status code", () => {
        expect(response.status).toBe(200);
      });

      it("Should return an expected result", () => {
        expect(response.body).toEqual([
          {
            title: "Smart Watch",
            price: 799,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/watches_PNG9854.png",
          },
          {
            title: "New T-Shirt",
            price: 699,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/bdefcbc72735f64db17f3250b1e64245.png",
          },
          {
            title: "Nikon Camera",
            price: 3499,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/photo_camera_PNG7834.png",
          },
          {
            title: "Apple Monitor",
            price: 8999,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/580b57fbd9996e24bc43bfe2.png",
          },
          {
            title: "Old School Radio",
            price: 975,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/58ac44f7f86c9c2eea74c4e6.png",
          },
          {
            title: "Compact Stereo Speakers",
            price: 850,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/z120-stereo-speakers.png",
          },
          {
            title: "Flying Drone 42K black",
            price: 4000,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/5cb84c5f7ff3656569c8cec5.png",
          },
          {
            title: "Powerful Black Speakers",
            price: 999,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/Speaker-PNG-Background-Image.png",
          },
          {
            title: "Pink Beat Headphones",
            price: 599,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/580b57fbd9996e24bc43bfba.png",
          },
          {
            title: "Vintage Microphone and Stand",
            price: 2400,
            imageUrl:
              "https://storage.googleapis.com/kidslikev2_bucket/580b57fbd9996e24bc43bfdb.png",
          },
        ]);
      });
    });
  });
});
