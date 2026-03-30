import express from 'express';
import registerRouter from './register.js';
import apiKeysRouter from './apiKeys.js';
import webhooksRouter from './webhooks.js';
import analyticsRouter from './analytics.js';
import settingsRouter from './settings.js';
import profileRouter from './profile.js';

const router = express.Router();

router.use(registerRouter);
router.use(apiKeysRouter);
router.use(webhooksRouter);
router.use(analyticsRouter);
router.use(settingsRouter);
router.use(profileRouter);

export default router;
