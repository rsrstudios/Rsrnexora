import { Router } from "express";
import { TimeService } from "../services/timeService";

export const timeRouter = Router();

// GET /api/time - Real-time system clock ground truth
timeRouter.get("/", (req, res) => {
  const requestedZone = (req.query.tz as string) || (req.headers["x-timezone"] as string);
  const context = TimeService.getTimeContext(requestedZone);

  res.json({
    success: true,
    serverTime: context,
  });
});

// POST /api/time/convert - Timezone conversion and date arithmetic
timeRouter.post("/convert", (req, res) => {
  const { fromTime, fromZone, toZone } = req.body;
  const targetZone = TimeService.sanitizeTimezone(toZone);
  const sourceZone = TimeService.sanitizeTimezone(fromZone);

  let dateObj: Date;
  if (fromTime) {
    dateObj = new Date(fromTime);
    if (isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }
  } else {
    dateObj = new Date();
  }

  const convertedTime = TimeService.formatTimeInZone(dateObj, targetZone);
  const convertedDate = TimeService.formatDateInZone(dateObj, targetZone);

  res.json({
    success: true,
    source: {
      timezone: sourceZone,
      time: TimeService.formatTimeInZone(dateObj, sourceZone),
      date: TimeService.formatDateInZone(dateObj, sourceZone),
    },
    target: {
      timezone: targetZone,
      time: convertedTime,
      date: convertedDate,
    },
    iso: dateObj.toISOString(),
  });
});
