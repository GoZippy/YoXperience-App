import { db } from "./client.js";
import {
  organizations,
  projects,
  apiKeys,
  users,
  slotDefinitions,
  layoutConfigs,
  userPreferences,
} from "./schema.js";
import { nanoid } from "nanoid";

async function seed() {
  // Check if already seeded
  const existingOrg = db.select().from(organizations).all();
  if (existingOrg.length > 0) {
    console.log("Database already seeded. Skipping.");
    return;
  }

  const orgId = `org_${nanoid(10)}`;
  db.insert(organizations)
    .values({
      id: orgId,
      name: "Acme Corp",
      slug: "acme-corp"
    })
    .run();

  const projectId = `prj_${nanoid(10)}`;
  db.insert(projects)
    .values({
      id: projectId,
      organizationId: orgId,
      name: "Acme Web App"
    })
    .run();

  const apiKey = `pk_live_${nanoid(24)}`;
  db.insert(apiKeys)
    .values({
      key: apiKey,
      projectId,
      name: "Production Key"
    })
    .run();

  const userIds = {
    alice: `usr_${nanoid(10)}`,
    bob: `usr_${nanoid(10)}`,
    carol: `usr_${nanoid(10)}`,
  };

  db.insert(users)
    .values([
      { id: userIds.alice, projectId, name: "Alice", email: "alice@example.com" },
      { id: userIds.bob, projectId, name: "Bob", email: "bob@example.com" },
      { id: userIds.carol, projectId, name: "Carol", email: "carol@example.com" },
    ])
    .run();

  const slots = [
    {
      id: `slot_${nanoid(10)}`,
      projectId,
      slotKey: "hero-banner",
      description: "Main hero section at top of dashboard",
      variants: JSON.stringify(["minimal", "image-heavy", "video"]),
      defaultVariant: "minimal",
    },
    {
      id: `slot_${nanoid(10)}`,
      projectId,
      slotKey: "nav-style",
      description: "Navigation layout style",
      variants: JSON.stringify(["sidebar", "topbar", "minimal"]),
      defaultVariant: "sidebar",
    },
    {
      id: `slot_${nanoid(10)}`,
      projectId,
      slotKey: "cta-block",
      description: "Call-to-action block",
      variants: JSON.stringify(["prominent", "subtle", "hidden"]),
      defaultVariant: "prominent",
    },
  ];

  db.insert(slotDefinitions).values(slots).run();

  db.insert(layoutConfigs)
    .values([
      {
        id: `lc_${nanoid(10)}`,
        projectId,
        name: "default",
        slotAssignments: JSON.stringify({
          "hero-banner": "minimal",
          "nav-style": "sidebar",
          "cta-block": "prominent",
        }),
      },
      {
        id: `lc_${nanoid(10)}`,
        projectId,
        name: "power-user",
        slotAssignments: JSON.stringify({
          "hero-banner": "minimal",
          "nav-style": "minimal",
          "cta-block": "hidden",
        }),
      },
      {
        id: `lc_${nanoid(10)}`,
        projectId,
        name: "visual-learner",
        slotAssignments: JSON.stringify({
          "hero-banner": "image-heavy",
          "nav-style": "topbar",
          "cta-block": "prominent",
        }),
      },
    ])
    .run();

  // Initial preferences: all users get defaults
  for (const userId of Object.values(userIds)) {
    for (const slot of slots) {
      const variants: string[] = JSON.parse(slot.variants);
      const weights: Record<string, number> = {};
      variants.forEach((v) => {
        weights[v] = v === slot.defaultVariant ? 1.0 : 0.0;
      });
      db.insert(userPreferences)
        .values({
          id: `pref_${nanoid(10)}`,
          projectId,
          userId,
          slotKey: slot.slotKey,
          variantWeights: JSON.stringify(weights),
          resolvedVariant: slot.defaultVariant,
        })
        .run();
    }
  }

  console.log("Seeded successfully.");
  console.log("Org ID:", orgId);
  console.log("Project ID:", projectId);
  console.log("API Key:", apiKey);
  console.log("User IDs:", userIds);
}

seed().catch(console.error);
