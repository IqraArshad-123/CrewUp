import { redis, boardCacheKey } from "./infrastructure";
import { Router } from "express";
import { z } from "zod";
import mongoose from "mongoose";
import { Job } from "./models";
export const publicRouter = Router();
const params = z
  .object({
    searchMode:z.enum(["literal","keywords"]).default("literal"),
  location:z.string().trim().max(100).optional(),
  q: z.string().trim().max(100).default(""),
    cursor: z
      .string()
      .regex(/^[a-f0-9]{24}$/i)
      .optional(),
    limit: z.coerce.number().int().min(1).max(60).default(24),
    workMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
    employmentType: z
      .enum(["contract", "full_time", "part_time", "internship"])
      .optional(),
    currency: z.enum(["USD", "PKR", "GBP", "EUR"]).optional(),
    minBudget: z.coerce.number().nonnegative().optional(),
    category: z.string().max(80).optional(),
  })
  .strict();
export function boardPipeline(d: z.infer<typeof params>) {
  const match: any = { status: "open", moderationBlocked: { $ne: true } };
  if(d.searchMode==="keywords"&&d.q)match.$text={$search:d.q};
  if (d.cursor) match._id = { $lt: new mongoose.Types.ObjectId(d.cursor) };
  if (d.employmentType) match.employmentType = d.employmentType;
  if (d.currency) match.currency = d.currency;
  if (d.minBudget !== undefined) match.budgetMax = { $gte: d.minBudget };
  const stages: any[] = [
    { $match: match },
    { $sort: { _id: -1 } },
    {
      $lookup: {
        from: "companies",
        localField: "companyId",
        foreignField: "_id",
        as: "company",
      },
    },
    { $unwind: "$company" },
    { $match: { "company.status": "verified" } },
    {
      $lookup: {
        from: "projects",
        localField: "projectId",
        foreignField: "_id",
        as: "project",
      },
    },
    { $unwind: "$project" },
    { $match: { "project.status": "active" } },
  ];
  const filters: any = {};
  if (d.workMode) filters["project.workMode"] = d.workMode;
  if (d.category) filters["project.category"] = d.category;
  if(d.location)filters["project.location"]={$regex:d.location.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),$options:"i"};
  if (d.q && d.searchMode==="literal") {
    const escaped = d.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filters.$or = ["title", "description", "skills", "company.name", "project.name"].map(
      (k) => ({ [k]: { $regex: escaped, $options: "i" } }),
    );
  }
  stages.push(
    { $match: filters },
    { $limit: d.limit + 1 },
    { $project: { moderationReason: 0, "company.ownerId": 0 } },
  );
  return stages;
}
publicRouter.get("/jobs", async (req, res) => {
  const d = params.parse(req.query);
  const key = await boardCacheKey(d);
  let rows: any[] | null = null;
  if (key && redis) {
    try {
      const cached = JSON.parse((await redis.get(key)) || "null");
      if (Array.isArray(cached) && cached.length) {
        const pipeline = boardPipeline(d);
        pipeline[0].$match._id = {
          $in: cached.map((v: string) => new mongoose.Types.ObjectId(v)),
          ...(d.cursor ? { $lt: new mongoose.Types.ObjectId(d.cursor) } : {}),
        };
        const current = await Job.aggregate(pipeline);
        if (current.length === cached.length) rows = current;
      }
    } catch {}
  }
  if (!rows) {
    rows = await Job.aggregate(boardPipeline(d));
    if (key && redis)
      await redis
        .set(key, JSON.stringify(rows.map((j) => String(j._id))), "EX", 15)
        .catch(() => {});
  }
  res.json({
    jobs: rows.slice(0, d.limit),
    nextCursor: rows.length > d.limit ? String(rows[d.limit - 1]._id) : null,
  });
});
