import { Router } from "express";
import mongoose from "mongoose";
import Joi from "joi";
import validate from "../helpers/function-helpers/validate";
import tryCatchWrapper from "../helpers/function-helpers/try-catch-wrapper";
import {
  register,
  login,
  refreshTokens,
  authorize,
  logout,
  googleAuth,
  googleRedirect,
} from "./auth.controller";

const signUpInSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
});

const refreshTokensSchema = Joi.object({
  sid: Joi.string()
    .custom((value, helpers) => {
      const isValidObjectId = mongoose.Types.ObjectId.isValid(value);
      if (!isValidObjectId) {
        return helpers.message({
          custom: "Invalid 'sid'. Must be MongoDB ObjectId",
        });
      }
      return value;
    })
    .required(),
});

const router = Router();

router.post("/register", validate(signUpInSchema), tryCatchWrapper(register));
router.post("/login", validate(signUpInSchema), tryCatchWrapper(login));
router.post(
  "/refresh",
  validate(refreshTokensSchema),
  tryCatchWrapper(refreshTokens)
);
router.post("/logout", tryCatchWrapper(authorize), tryCatchWrapper(logout));
router.get("/google", tryCatchWrapper(googleAuth));
router.get("/google-redirect", tryCatchWrapper(googleRedirect));

export default router;
