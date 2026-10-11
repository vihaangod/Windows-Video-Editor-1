import { Router, type IRouter } from "express";
import healthRouter from "./health";
import teamRouter from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(teamRouter);

export default router;
