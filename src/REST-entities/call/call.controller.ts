import { Request, Response } from "express";
import { Categories } from "./../../helpers/typescript-helpers/enums";
import { ICall, IUser } from "../../helpers/typescript-helpers/interfaces";
import { uploadImage } from "../../helpers/function-helpers/multer-config";
import CallModel from "./call.model";
import UserModel from "../user/user.model";
import ads from "./ads";

export const postCall = async (req: Request, res: Response) => {
  const user = req.user;
  const callObj: ICall = req.body;
  const callImages = req.files;
  if (req.fileValidationError) {
    return res.status(415).send({ message: req.fileValidationError });
  }
  if (req.files.length > 5) {
    return res
      .status(400)
      .send({ message: "Only 5 and less images are allowed" });
  }
  if (!req.files.length) {
    return res.status(400).send({ message: "No images provided" });
  }
  if (
    (callObj.category === Categories.WORK ||
      callObj.category === Categories.FREE ||
      callObj.category === Categories.TRADE) &&
    Number(callObj.price) !== 0
  ) {
    return res.status(400).send({
      message: `Can't set price for ${callObj.category} category. Must be 0`,
    });
  }
  const imageUrls: string[] = [];
  for (const image of callImages as Express.Multer.File[]) {
    const imageUrl = await uploadImage(image);
    imageUrls.push(imageUrl as string);
  }
  const call = await CallModel.create({
    ...callObj,
    imageUrls,
    price: Number(callObj.price),
    isOnSale: false,
    userId: (user as IUser)._id,
  });
  (user as IUser).calls.push(call);
  (user as IUser).save();
  return res.status(201).send({
    ...callObj,
    imageUrls,
    price: Number(callObj.price),
    isOnSale: false,
    userId: (user as IUser)._id,
    id: call._id,
  });
};

export const addToFavourites = async (req: Request, res: Response) => {
  const user = req.user;
  const { callId } = req.params;
  const callToAdd = await CallModel.findById(callId);
  if (!callToAdd) {
    return res.status(404).send({ message: "Call not found" });
  }
  if (
    (user as IUser).favourites.find((call) => call._id.toString() === callId)
  ) {
    return res.status(403).send({ message: "Already in favourites" });
  }
  (user as IUser).favourites.push(callToAdd);
  await (user as IUser).save();
  return res.status(200).send({ newFavourites: (user as IUser).favourites });
};

export const removeFromFavourites = async (req: Request, res: Response) => {
  const user = req.user;
  const { callId } = req.params;
  const callToRemove = await CallModel.findById(callId);
  if (!callToRemove) {
    return res.status(404).send({ message: "Call not found" });
  }
  if (
    !(user as IUser).favourites.find((call) => call._id.toString() === callId)
  ) {
    return res.status(403).send({ message: "Not in favourites" });
  }
  const updatedUser = await UserModel.findByIdAndUpdate(
    (user as IUser)._id,
    {
      $pull: { favourites: { _id: callId } },
    },
    { new: true }
  );
  return res
    .status(200)
    .send({ newFavourites: (updatedUser as IUser).favourites });
};

export const deleteCall = async (req: Request, res: Response) => {
  const user = req.user;
  const { callId } = req.params;
  const callToDelete = await CallModel.findById(callId);
  if (
    !callToDelete ||
    !(user as IUser).calls.find((call) => call._id.toString() === callId)
  ) {
    return res.status(404).send({ message: "Call not found" });
  }
  await CallModel.findByIdAndDelete(callId);
  await UserModel.findOneAndUpdate(
    { _id: (user as IUser)._id },
    { $pull: { calls: { _id: callId } } },
    { new: true }
  );
  if (
    (user as IUser).favourites.find((call) => call._id.toString() === callId)
  ) {
    await UserModel.findOneAndUpdate(
      { _id: (user as IUser)._id },
      { $pull: { favourites: { _id: callId } } },
      { new: true }
    );
  }
  return res.status(204).end();
};

export const editCall = async (req: Request, res: Response) => {
  const user = req.user;
  const { callId } = req.params;
  const fieldsToChange = req.body;
  const callToUpdate = await CallModel.findById(callId);
  let callImages: Express.Multer.File[];
  let userCall = (user as IUser).calls.find(
    (call) => call._id.toString() === callId
  );
  if (!callToUpdate || !userCall) {
    return res.status(404).send({ message: "Call not found" });
  }
  if (
    (userCall.category === Categories.WORK ||
      userCall.category === Categories.FREE ||
      userCall.category === Categories.TRADE) &&
    Number(fieldsToChange.price)
  ) {
    return res.status(400).send({
      message: `Can't set price for ${userCall.category} category. Must be 0`,
    });
  }
  if (fieldsToChange.category) {
    if (
      (fieldsToChange.category === Categories.TRADE ||
        fieldsToChange.category === Categories.FREE ||
        fieldsToChange.category === Categories.WORK) &&
      Number(fieldsToChange.price)
    ) {
      return res.status(400).send({
        message: `Can't set price for ${fieldsToChange.category} category. Must be 0`,
      });
    }
  }
  if (req.fileValidationError) {
    return res.status(415).send({ message: req.fileValidationError });
  }
  if (req.files) {
    if (req.files.length > 5) {
      return res
        .status(400)
        .send({ message: "Only 5 and less images are allowed" });
    }
    callImages = req.files as Express.Multer.File[];
    const imageUrls: string[] = [];
    for (const image of callImages as Express.Multer.File[]) {
      const imageUrl = await uploadImage(image);
      imageUrls.push(imageUrl as string);
    }
    (userCall as ICall).imageUrls = imageUrls;
  }
  if (fieldsToChange.price) {
    if (fieldsToChange.price === (userCall as ICall).price) {
      return res.status(400).send({ message: "Can't set the same price" });
    }
    (userCall as ICall).oldPrice = (userCall as ICall).price;
    userCall = { ...userCall.toObject(), ...fieldsToChange };
    if (((userCall as ICall).oldPrice as number) > (userCall as ICall).price) {
      (userCall as ICall).isOnSale = true;
      ((userCall as ICall).discountPercents as number) =
        100 -
        ((userCall as ICall).price * 100) /
          ((userCall as ICall).oldPrice as number);
    }
    if (((userCall as ICall).oldPrice as number) < (userCall as ICall).price) {
      (userCall as ICall).isOnSale = false;
      (userCall as ICall).discountPercents = 0;
    }
  } else {
    userCall = { ...userCall.toObject(), ...fieldsToChange };
  }
  await CallModel.findByIdAndUpdate(callId, userCall, {
    overwrite: true,
  });
  if ((userCall as ICall).oldPrice) {
    await UserModel.findOneAndUpdate(
      { "calls._id": callId },
      {
        $set: {
          "calls.$.title": (userCall as ICall).title,
          "calls.$.description": (userCall as ICall).description,
          "calls.$.category": (userCall as ICall).category,
          "calls.$.price": Number((userCall as ICall).price),
          "calls.$.imageUrls": (userCall as ICall).imageUrls,
          "calls.$.phone": (userCall as ICall).phone,
          "calls.$.oldPrice": (userCall as ICall).oldPrice,
          "calls.$.discountPercents": (userCall as ICall).discountPercents,
          "calls.$.isOnSale": (userCall as ICall).isOnSale,
          "calls.$.userId": (userCall as ICall).userId,
        },
      }
    );
    return res.status(200).send({
      title: (userCall as ICall).title,
      imageUrls: (userCall as ICall).imageUrls,
      description: (userCall as ICall).description,
      category: (userCall as ICall).category,
      price: Number((userCall as ICall).price),
      oldPrice: (userCall as ICall).oldPrice,
      isOnSale: (userCall as ICall).isOnSale,
      discountPercents: (userCall as ICall).discountPercents,
      phone: (userCall as ICall).phone,
      userId: (userCall as ICall).userId,
      id: (userCall as ICall)._id,
    });
  }
  await UserModel.findOneAndUpdate(
    { "calls._id": callId },
    {
      $set: {
        "calls.$.title": (userCall as ICall).title,
        "calls.$.description": (userCall as ICall).description,
        "calls.$.category": (userCall as ICall).category,
        "calls.$.price": Number((userCall as ICall).price),
        "calls.$.imageUrls": (userCall as ICall).imageUrls,
        "calls.$.phone": (userCall as ICall).phone,
        "calls.$.isOnSale": (userCall as ICall).isOnSale,
        "calls.$.userId": (userCall as ICall).userId,
      },
    }
  );
  return res.status(200).send({
    title: (userCall as ICall).title,
    imageUrls: (userCall as ICall).imageUrls,
    description: (userCall as ICall).description,
    category: (userCall as ICall).category,
    price: Number((userCall as ICall).price),
    isOnSale: (userCall as ICall).isOnSale,
    phone: (userCall as ICall).phone,
    userId: (userCall as ICall).userId,
    id: (userCall as ICall)._id,
  });
};

export const loadPages = async (req: Request, res: Response) => {
  const { page } = req.query;
  switch (page) {
    case "1":
      const sales = await CallModel.find({ isOnSale: true });
      const recreationAndSport = await CallModel.find({
        category: Categories.RECREATION_AND_SPORT,
      });
      const free = await CallModel.find({
        category: Categories.FREE,
      });
      const businessAndServices = await CallModel.find({
        category: Categories.BUSINESS_AND_SERVICES,
      });
      return res
        .status(200)
        .send({ sales, recreationAndSport, free, businessAndServices });

    case "2":
      const work = await CallModel.find({ category: Categories.WORK });
      const transport = await CallModel.find({
        category: Categories.TRANSPORT,
      });
      const electronics = await CallModel.find({
        category: Categories.ELECTRONICS,
      });
      const trade = await CallModel.find({
        category: Categories.TRADE,
      });
      return res.status(200).send({ work, transport, electronics, trade });

    case "3":
      const property = await CallModel.find({ category: Categories.PROPERTY });
      return res.status(200).send({ property });

    default:
      break;
  }
};

export const getFavourites = (req: Request, res: Response) => {
  const user = req.user;
  res.status(200).send({ favourites: (user as IUser).favourites });
};

export const getCalls = (req: Request, res: Response) => {
  const user = req.user;
  res.status(200).send({ favourites: (user as IUser).calls });
};

export const searchCalls = async (req: Request, res: Response) => {
  const { search } = req.query;
  const foundCalls = await CallModel.find({
    title: { $regex: search as string, $options: "i" },
  }).lean();
  return res.status(200).send(foundCalls);
};

export const getCategories = async (req: Request, res: Response) => {
  const categories: string[] = [];
  for (const category of Object.values(Categories)) {
    categories.push(category);
  }
  res.status(200).send(categories);
};

export const getRussianCategories = async (req: Request, res: Response) => {
  res
    .status(200)
    .send([
      "Недвижимость",
      "Транспорт",
      "Работа",
      "Электроника",
      "Бизнес и услуги",
      "Отдых и спорт",
      "Отдам бесплатно",
      "Обмен",
    ]);
};

export const getCategory = async (req: Request, res: Response) => {
  let { category } = req.params;
  let calls: ICall[];
  calls = await CallModel.find({ category });
  if (category === "businessAndServices") {
    calls = await CallModel.find({ category: "business and services" });
  }
  if (category === "recreationAndSport") {
    calls = await CallModel.find({ category: "recreation and sport" });
  }
  if (!calls.length) {
    return res.status(404).send({ message: "No calls found" });
  }
  return res.status(200).send(calls);
};

export const getAds = async (req: Request, res: Response) => {
  res.status(200).send(ads);
};
