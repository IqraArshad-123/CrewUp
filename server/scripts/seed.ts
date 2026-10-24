import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connect, User, Company, Member, Project, Job } from "../src/models";
import { config } from "../src/config";
async function seed() {
  if (config.production)
    throw new Error("Demo seeding is disabled in production.");
  await connect();
  const passwordHash = await bcrypt.hash("CrewUpDemo!2026", 12);
  const identities = [
    ["recruiter", "Alex Morgan"],
    ["admin", "Sam Rivera"],
    ["applicant", "Ayesha Khan"],
  ] as const;
  const users: Record<string, any> = {};
  for (const [role, name] of identities)
    users[role] = await User.findOneAndUpdate(
      { email: `${role}@crewup.demo` },
      {
        $setOnInsert: {
          name,
          role,
          passwordHash,
          verified: true,
          status: "active",
        },
      },
      { upsert: true, new: true },
    );
  const company = await Company.findOneAndUpdate(
    { ownerId: users.recruiter._id },
    {
      $setOnInsert: {
        name: "Northstar Studio",
        description:
          "An independent product studio building thoughtful digital experiences and bringing ambitious ideas to life.",
        industry: "Software & technology",
        website: "https://example.com",
        status: "verified",
      },
    },
    { upsert: true, new: true },
  );
  await Member.updateOne(
    { userId: users.recruiter._id },
    { $setOnInsert: { companyId: company._id, role: "owner" } },
    { upsert: true },
  );
  const start = new Date();
  start.setUTCDate(start.getUTCDate() + 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 60);
  const items = [
    {
      name: "A fresh take on commerce",
      category: "Software & technology",
      description:
        "Building a thoughtful shopping experience for independent brands. Simple discovery, beautiful storefronts, and a checkout that just works.",
      roles: [
        ["Frontend developer", "React, TypeScript, Next.js", 2000, 3500],
        ["Backend developer", "Node.js, MongoDB, Express", 2500, 4000],
      ],
      open: true,
    },
    {
      name: "A brand with a bigger story",
      category: "Design & creative",
      description:
        "A new visual identity for a sustainable lifestyle brand. We’re bringing together strategy, storytelling and a fresh creative perspective.",
      roles: [["Brand designer", "Figma, Branding, Typography", 1500, 2800]],
      open: true,
    },
    {
      name: "The next chapter of Northstar",
      category: "Marketing & content",
      description:
        "An editorial launch campaign that shares the stories behind our studio and helps our next collaborators find us.",
      roles: [["Content strategist", "Copywriting, Strategy, SEO", 1000, 1800]],
      open: false,
    },
    {
      name: "Infrastructure that grows with us",
      category: "Software & technology",
      description:
        "Designing a reliable foundation for our next generation of products, with clear deployment workflows and practical monitoring.",
      roles: [["DevOps engineer", "Docker, AWS, CI/CD", 2500, 4500]],
      open: false,
    },
  ];
  for (const item of items) {
    const p = await Project.findOneAndUpdate(
      { companyId: company._id, name: item.name },
      {
        $setOnInsert: {
          description: item.description,
          category: item.category,
          startDate: start,
          endDate: end,
          workMode: "remote",
          status: "active",
        },
      },
      { upsert: true, new: true },
    );
    for (const [title, skills, min, max] of item.roles)
      await Job.updateOne(
        { projectId: p._id, title },
        {
          $setOnInsert: {
            companyId: company._id,
            description: `Join the crew for ${item.name}. Own the ${String(title).toLowerCase()} responsibilities, collaborate with the team, and deliver thoughtful, well-documented work.`,
            skills: String(skills).split(", "),
            budgetMin: min,
            budgetMax: max,
            currency: "USD",
            employmentType: "contract",
            status: item.open ? "open" : "draft",
          },
        },
        { upsert: true },
      );
  }
  console.log(
    "Sample workspace ready. Local demo accounts: recruiter@crewup.demo, admin@crewup.demo, applicant@crewup.demo. Password: CrewUpDemo!2026",
  );
  await mongoose.disconnect();
}
seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
