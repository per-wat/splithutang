import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { createClient, type User } from "@supabase/supabase-js";

import type { Database, Json } from "../src/types/database.ts";

const NAMESPACE = "splithutang-performance-v1";
const EMAIL_DOMAIN = "example.test";
const REQUIRED_CONFIRMATION = "SEED_SPLITHUTANG_PERFORMANCE_PROJECT";
const BATCH_SIZE = 400;

type Tables = Database["public"]["Tables"];
type Expense = Tables["expenses"]["Insert"];
type ExpenseParticipant = Tables["expense_participants"]["Insert"];
type ExpenseItem = Tables["expense_items"]["Insert"];
type ExpenseItemParticipant = Tables["expense_item_participants"]["Insert"];
type ExpenseItemAddon = Tables["expense_item_addons"]["Insert"];
type ExpensePayment = Tables["expense_payments"]["Insert"];
type Group = Tables["groups"]["Insert"];
type GroupMember = Tables["group_members"]["Insert"];
type Iou = Tables["ious"]["Insert"];
type IouPayment = Tables["iou_payments"]["Insert"];
type Notification = Tables["notifications"]["Insert"];

type DbError = {
  message: string;
  details?: string | null;
  hint?: string | null;
};

type DbResult = { error: DbError | null };

type Preset = {
  users: number;
  groups: number;
  membersPerGroup: number;
  expensesPerGroup: number;
  iousPerGroup: number;
  notificationsPerUser: number;
};

type TestUser = {
  id: string;
  personId: string;
  email: string;
  name: string;
};

type GroupFixture = {
  id: string;
  name: string;
  owner: TestUser;
  members: TestUser[];
};

const PRESETS: Record<string, Preset> = {
  realistic: {
    users: 12,
    groups: 10,
    membersPerGroup: 7,
    expensesPerGroup: 120,
    iousPerGroup: 45,
    notificationsPerUser: 250,
  },
  heavy: {
    users: 24,
    groups: 20,
    membersPerGroup: 10,
    expensesPerGroup: 300,
    iousPerGroup: 120,
    notificationsPerUser: 1_000,
  },
};

const DISPLAY_NAMES = [
  "Aiman Rahman",
  "Nur Aisyah",
  "Benjamin Lee",
  "Chloe Tan",
  "Daniel Wong",
  "Farah Aziz",
  "Hazim Noor",
  "Isabelle Lim",
  "Jason Ong",
  "Kavitha Nair",
  "Marcus Goh",
  "Siti Hajar",
  "Amirul Hakim",
  "Brenda Chua",
  "Caleb Teo",
  "Diyana Salleh",
  "Ethan Low",
  "Fatin Izzati",
  "Gavin Khoo",
  "Hannah Yap",
  "Imran Zain",
  "Joanne Kaur",
  "Khairul Anwar",
  "Li Xuan",
];

const AVATAR_COLORS = [
  "bg-blue-600",
  "bg-purple-600",
  "bg-pink-600",
  "bg-rose-600",
  "bg-orange-600",
  "bg-emerald-600",
  "bg-cyan-600",
  "bg-indigo-600",
];

const GROUP_NAMES = [
  "Weekend in Penang",
  "KL Housemates",
  "Office Lunch Club",
  "Langkawi Escape",
  "Badminton Crew",
  "Family Groceries",
  "Cafe Hoppers",
  "Road Trip North",
  "Project Team",
  "Condo Utilities",
  "Sabah Adventure",
  "Friday Dinner",
  "Cycling Friends",
  "Study Group",
  "Wedding Helpers",
  "Movie Nights",
  "Melaka Weekend",
  "Shared Subscriptions",
  "Futsal Team",
  "Festive Potluck",
];

const EXPENSE_NAMES = [
  "Nasi lemak breakfast",
  "Petrol",
  "Grab ride",
  "Dinner",
  "Groceries",
  "Parking",
  "Hotel",
  "Coffee and pastries",
  "Movie tickets",
  "Utilities",
  "Lunch delivery",
  "Toll charges",
];

const IOU_REASONS = [
  "Concert ticket",
  "Emergency cash",
  "Shared subscription",
  "Birthday present",
  "Train ticket",
  "Phone bill",
  "Equipment deposit",
  "Event registration",
];

const ITEM_NAMES = ["Main dish", "Drinks", "Dessert", "Transport", "Tickets"];
const ADDON_NAMES = ["Service charge", "Extra topping", "Delivery fee", "Parking fee"];

function requireEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = (
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  const expectedRef = process.env.PERF_TEST_PROJECT_REF?.trim();
  const productionRef = process.env.PERF_TEST_PRODUCTION_PROJECT_REF?.trim();
  const confirmation = process.env.PERF_TEST_CONFIRM?.trim();
  const password = process.env.PERF_TEST_PASSWORD;

  if (!url || !secretKey || !expectedRef || !productionRef || !password) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), PERF_TEST_PROJECT_REF, PERF_TEST_PRODUCTION_PROJECT_REF, or PERF_TEST_PASSWORD.",
    );
  }

  if (confirmation !== REQUIRED_CONFIRMATION) {
    throw new Error(
      `PERF_TEST_CONFIRM must exactly equal ${REQUIRED_CONFIRMATION}.`,
    );
  }

  const parsedUrl = new URL(url);
  const actualRef = parsedUrl.hostname.endsWith(".supabase.co")
    ? parsedUrl.hostname.slice(0, -".supabase.co".length)
    : null;

  if (!actualRef || actualRef !== expectedRef) {
    throw new Error(
      `Safety stop: URL project ref (${actualRef ?? "unrecognised"}) does not exactly match PERF_TEST_PROJECT_REF (${expectedRef}).`,
    );
  }

  if (expectedRef === productionRef) {
    throw new Error("Safety stop: the selected project ref is the declared production project.");
  }

  if (password.length < 12) {
    throw new Error("PERF_TEST_PASSWORD must contain at least 12 characters.");
  }

  return { url, secretKey, password, expectedRef };
}

function stableUuid(key: string) {
  const chars = createHash("sha256")
    .update(`${NAMESPACE}:${key}`)
    .digest("hex")
    .slice(0, 32)
    .split("");

  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16], 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function money(cents: number) {
  return Number((cents / 100).toFixed(2));
}

function isoDaysAgo(days: number, minutes = 0) {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - days);
  value.setUTCMinutes(value.getUTCMinutes() - minutes);
  return value.toISOString();
}

function dateDaysAgo(days: number) {
  return isoDaysAgo(days).slice(0, 10);
}

function distribute(totalCents: number, count: number) {
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function formatDbError(label: string, error: DbError) {
  const details = [error.message, error.details, error.hint].filter(Boolean).join(" | ");
  return new Error(`${label} failed: ${details}`);
}

async function insertBatches<T>(
  label: string,
  rows: T[],
  insert: (batch: T[]) => PromiseLike<DbResult>,
) {
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const { error } = await insert(batch);
    if (error) throw formatDbError(label, error);
    const done = Math.min(start + batch.length, rows.length);
    process.stdout.write(`\r${label}: ${done}/${rows.length}`);
  }

  if (rows.length > 0) process.stdout.write("\n");
}

async function listAllUsers(
  admin: ReturnType<typeof createClient<Database>>,
) {
  const users: User[] = [];
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Unable to list Auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 100) return users;
    page += 1;
  }
}

function isNamespacedUser(user: User) {
  return (
    user.email?.endsWith(`@${EMAIL_DOMAIN}`) === true &&
    user.user_metadata?.performance_test === true &&
    user.user_metadata?.performance_namespace === NAMESPACE
  );
}

async function ensureEmptyPerformanceProject(
  admin: ReturnType<typeof createClient<Database>>,
) {
  const users = await listAllUsers(admin);
  const unrelated = users.filter((user) => !isNamespacedUser(user));
  const namespaced = users.filter(isNamespacedUser);

  if (unrelated.length > 0) {
    const examples = unrelated
      .slice(0, 5)
      .map((user) => user.email ?? user.id)
      .join(", ");
    throw new Error(
      `Safety stop: this Auth project contains ${unrelated.length} non-performance user(s), including ${examples}. Use a dedicated disposable Supabase project.`,
    );
  }

  if (namespaced.length > 0) {
    throw new Error(
      `Performance data already exists (${namespaced.length} test users). Run npm run cleanup:performance before reseeding.`,
    );
  }
}

async function createTestUsers(
  admin: ReturnType<typeof createClient<Database>>,
  count: number,
  password: string,
) {
  const users: Omit<TestUser, "personId">[] = [];

  for (let index = 0; index < count; index += 1) {
    const email = `perf.user${String(index + 1).padStart(2, "0")}@${EMAIL_DOMAIN}`;
    const name = DISPLAY_NAMES[index];
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: name,
        performance_test: true,
        performance_namespace: NAMESPACE,
      },
      app_metadata: {
        performance_test: true,
        performance_namespace: NAMESPACE,
      },
    });

    if (error || !data.user) {
      throw new Error(`Creating ${email} failed: ${error?.message ?? "no user returned"}`);
    }

    users.push({ id: data.user.id, email, name });
    process.stdout.write(`\rAuth users: ${index + 1}/${count}`);
  }
  process.stdout.write("\n");

  const profileRows: Tables["profiles"]["Insert"][] = users.map((user, index) => ({
    id: user.id,
    display_name: user.name,
    avatar_color: AVATAR_COLORS[index % AVATAR_COLORS.length],
    updated_at: new Date().toISOString(),
  }));
  const { error: profileError } = await admin.from("profiles").upsert(profileRows);
  if (profileError) throw formatDbError("Profile customisation", profileError);

  const { data: people, error: peopleError } = await admin
    .from("people")
    .select("id, linked_user_id")
    .in(
      "linked_user_id",
      users.map((user) => user.id),
    );

  if (peopleError) throw formatDbError("Canonical people lookup", peopleError);
  const peopleByUser = new Map(people.map((person) => [person.linked_user_id, person.id]));

  return users.map((user) => {
    const personId = peopleByUser.get(user.id);
    if (!personId) throw new Error(`Canonical person was not created for ${user.email}.`);
    return { ...user, personId };
  });
}

function buildGroups(users: TestUser[], preset: Preset) {
  const fixtures: GroupFixture[] = [];
  const groups: Group[] = [];
  const groupMembers: GroupMember[] = [];

  for (let groupIndex = 0; groupIndex < preset.groups; groupIndex += 1) {
    const owner = users[groupIndex % users.length];
    const memberSet = new Map<string, TestUser>([[owner.id, owner]]);

    for (let offset = 0; memberSet.size < preset.membersPerGroup; offset += 1) {
      const member = users[(groupIndex * 3 + offset) % users.length];
      memberSet.set(member.id, member);
    }

    const members = [...memberSet.values()];
    const id = stableUuid(`group:${groupIndex}`);
    const name = `[PERF ${NAMESPACE}] ${GROUP_NAMES[groupIndex]}`;
    const createdAt = isoDaysAgo(220 - groupIndex * 3);

    fixtures.push({ id, name, owner, members });
    groups.push({
      id,
      owner_id: owner.id,
      name,
      allow_debtor_self_confirm: groupIndex % 3 === 0,
      created_at: createdAt,
      updated_at: createdAt,
    });

    members.forEach((member) => {
      groupMembers.push({
        group_id: id,
        person_id: member.personId,
        role: member.id === owner.id ? "owner" : "member",
        membership_status: "active",
        created_at: createdAt,
      });
    });
  }

  return { fixtures, groups, groupMembers };
}

function buildFinancialData(fixtures: GroupFixture[], preset: Preset) {
  const expenses: Expense[] = [];
  const expenseParticipants: ExpenseParticipant[] = [];
  const expenseItems: ExpenseItem[] = [];
  const itemParticipants: ExpenseItemParticipant[] = [];
  const itemAddons: ExpenseItemAddon[] = [];
  const expensePayments: ExpensePayment[] = [];
  const ious: Iou[] = [];
  const iouPayments: IouPayment[] = [];

  fixtures.forEach((group, groupIndex) => {
    for (let expenseIndex = 0; expenseIndex < preset.expensesPerGroup; expenseIndex += 1) {
      const key = `expense:${groupIndex}:${expenseIndex}`;
      const id = stableUuid(key);
      const daysAgo = (expenseIndex * 3 + groupIndex * 7) % 365;
      const createdAt = isoDaysAgo(daysAgo, expenseIndex % 1_440);
      const payer = group.members[expenseIndex % group.members.length];
      const participantCount = Math.min(2 + (expenseIndex % 4), group.members.length);
      const participants = Array.from({ length: participantCount }, (_, offset) =>
        group.members[(expenseIndex + offset) % group.members.length],
      );
      if (!participants.some((person) => person.id === payer.id)) participants[0] = payer;

      const splitMethod = (["equal", "amount", "items"] as const)[expenseIndex % 3];
      const totalCents = 1_200 + ((groupIndex * 911 + expenseIndex * 379) % 28_000);
      const shareCents = new Map(participants.map((person) => [person.id, 0]));

      expenses.push({
        id,
        owner_id: group.owner.id,
        group_id: group.id,
        name: EXPENSE_NAMES[(groupIndex + expenseIndex) % EXPENSE_NAMES.length],
        expense_date: dateDaysAgo(daysAgo),
        paid_by: payer.personId,
        split_method: splitMethod,
        total_amount: money(totalCents),
        created_at: createdAt,
        updated_at: createdAt,
      });

      if (splitMethod === "items") {
        const itemCount = 2 + (expenseIndex % 2);
        const itemTotals = distribute(totalCents, itemCount);

        itemTotals.forEach((itemTotal, itemIndex) => {
          const itemId = stableUuid(`${key}:item:${itemIndex}`);
          const hasAddon = itemIndex === itemCount - 1 && expenseIndex % 2 === 0;
          const addonCents = hasAddon ? Math.min(350, Math.floor(itemTotal / 4)) : 0;
          const assignedCount = Math.min(1 + ((expenseIndex + itemIndex) % 3), participants.length);
          const assigned = Array.from({ length: assignedCount }, (_, offset) =>
            participants[(itemIndex + offset) % participants.length],
          );
          const assignedShares = distribute(itemTotal, assigned.length);

          expenseItems.push({
            id: itemId,
            expense_id: id,
            name: ITEM_NAMES[(expenseIndex + itemIndex) % ITEM_NAMES.length],
            amount: money(itemTotal - addonCents),
            sort_order: itemIndex,
            created_at: createdAt,
            updated_at: createdAt,
          });

          assigned.forEach((person, assignedIndex) => {
            itemParticipants.push({
              expense_item_id: itemId,
              person_id: person.personId,
              created_at: createdAt,
            });
            shareCents.set(person.id, (shareCents.get(person.id) ?? 0) + assignedShares[assignedIndex]);
          });

          if (hasAddon) {
            itemAddons.push({
              id: stableUuid(`${key}:item:${itemIndex}:addon`),
              expense_item_id: itemId,
              name: ADDON_NAMES[(expenseIndex + itemIndex) % ADDON_NAMES.length],
              amount: money(addonCents),
              sort_order: 0,
              created_at: createdAt,
              updated_at: createdAt,
            });
          }
        });
      } else {
        const shares = distribute(totalCents, participants.length);
        participants.forEach((person, index) => shareCents.set(person.id, shares[index]));
      }

      participants.forEach((person) => {
        expenseParticipants.push({
          id: stableUuid(`${key}:participant:${person.id}`),
          expense_id: id,
          person_id: person.personId,
          share_amount: money(shareCents.get(person.id) ?? 0),
          created_at: createdAt,
        });
      });

      if (expenseIndex % 3 === 0) {
        const debtor = participants.find(
          (person) => person.id !== payer.id && (shareCents.get(person.id) ?? 0) > 0,
        );
        if (debtor) {
          const status = (["confirmed", "pending", "rejected"] as const)[
            Math.floor(expenseIndex / 3) % 3
          ];
          const paidAt = isoDaysAgo(Math.max(0, daysAgo - 2), expenseIndex % 600);
          expensePayments.push({
            id: stableUuid(`${key}:payment`),
            expense_id: id,
            from_person_id: debtor.personId,
            to_person_id: payer.personId,
            amount: money(Math.max(100, Math.floor((shareCents.get(debtor.id) ?? 200) * 0.7))),
            paid_at: paidAt,
            note: expenseIndex % 6 === 0 ? "Bank transfer" : null,
            status,
            submitted_by_user_id: debtor.id,
            resolved_by_user_id: status === "pending" ? null : payer.id,
            resolved_at: status === "pending" ? null : paidAt,
            created_at: paidAt,
          });
        }
      }
    }

    for (let iouIndex = 0; iouIndex < preset.iousPerGroup; iouIndex += 1) {
      const key = `iou:${groupIndex}:${iouIndex}`;
      const id = stableUuid(key);
      const daysAgo = (iouIndex * 5 + groupIndex * 11) % 365;
      const from = group.members[iouIndex % group.members.length];
      const to = group.members[(iouIndex + 1 + (groupIndex % 2)) % group.members.length];
      const amountCents = 800 + ((iouIndex * 557 + groupIndex * 719) % 22_000);
      const createdAt = isoDaysAgo(daysAgo, iouIndex % 1_440);

      ious.push({
        id,
        owner_id: group.owner.id,
        group_id: group.id,
        from_person_id: from.personId,
        to_person_id: to.personId,
        amount: money(amountCents),
        reason: IOU_REASONS[(groupIndex + iouIndex) % IOU_REASONS.length],
        iou_date: dateDaysAgo(daysAgo),
        created_at: createdAt,
        updated_at: createdAt,
      });

      if (iouIndex % 3 === 0) {
        const status = (["confirmed", "pending", "rejected"] as const)[
          Math.floor(iouIndex / 3) % 3
        ];
        const paidAt = isoDaysAgo(Math.max(0, daysAgo - 1), iouIndex % 500);
        iouPayments.push({
          id: stableUuid(`${key}:payment`),
          iou_id: id,
          from_person_id: from.personId,
          to_person_id: to.personId,
          amount: money(Math.max(100, Math.floor(amountCents * 0.55))),
          paid_at: paidAt,
          note: iouIndex % 6 === 0 ? "DuitNow" : null,
          status,
          submitted_by_user_id: from.id,
          resolved_by_user_id: status === "pending" ? null : to.id,
          resolved_at: status === "pending" ? null : paidAt,
          created_at: paidAt,
        });
      }
    }
  });

  return {
    expenses,
    expenseParticipants,
    expenseItems,
    itemParticipants,
    itemAddons,
    expensePayments,
    ious,
    iouPayments,
  };
}

function buildNotifications(
  users: TestUser[],
  fixtures: GroupFixture[],
  expenses: Expense[],
  ious: Iou[],
  perUser: number,
) {
  const notifications: Notification[] = [];
  const expensesPerGroup = expenses.length / fixtures.length;
  const iousPerGroup = ious.length / fixtures.length;

  users.forEach((recipient, userIndex) => {
    const recipientGroups = fixtures.filter((group) =>
      group.members.some((member) => member.id === recipient.id),
    );
    if (recipientGroups.length === 0) {
      throw new Error(`No seeded group contains ${recipient.email}.`);
    }

    for (let index = 0; index < perUser; index += 1) {
      const group = recipientGroups[(userIndex + index) % recipientGroups.length];
      const groupIndex = fixtures.indexOf(group);
      const actorCandidates = group.members.filter((member) => member.id !== recipient.id);
      const actor = actorCandidates[index % actorCandidates.length];
      const expense = expenses[
        groupIndex * expensesPerGroup + (index % expensesPerGroup)
      ];
      const iou = ious[groupIndex * iousPerGroup + (index % iousPerGroup)];
      const variant = index % 4;
      const createdAt = isoDaysAgo(Math.floor(index / 5), index % 1_440);
      const readAt =
        index >= Math.ceil(perUser * 0.28)
          ? new Date(Math.min(Date.now(), Date.parse(createdAt) + 3_600_000)).toISOString()
          : null;

      let notificationType = "expense_created";
      let resourceType = "expense";
      let resourceId: string | null = expense.id ?? null;
      let title = `${actor.name} added an expense in ${group.name}.`;
      let body = `${expense.name} · RM ${Number(expense.total_amount).toFixed(2)}`;
      let metadata: Json = {
        performance_namespace: NAMESPACE,
        actor_name: actor.name,
        actor_avatar_color: AVATAR_COLORS[(userIndex + index + 1) % AVATAR_COLORS.length],
        group_name: group.name,
        expense_name: expense.name,
        amount: expense.total_amount,
      };

      if (variant === 1) {
        notificationType = "iou_created";
        resourceType = "iou";
        resourceId = iou.id ?? null;
        title = `${actor.name} added an IOU in ${group.name}.`;
        body = `${iou.reason} · RM ${Number(iou.amount).toFixed(2)}`;
        metadata = {
          performance_namespace: NAMESPACE,
          actor_name: actor.name,
          actor_avatar_color: AVATAR_COLORS[(userIndex + index + 1) % AVATAR_COLORS.length],
          group_name: group.name,
          iou_reason: iou.reason,
          amount: iou.amount,
        };
      } else if (variant === 2) {
        notificationType = "expense_payment_confirmed";
        title = `${actor.name} confirmed a payment.`;
        body = `RM ${(10 + (index % 90)).toFixed(2)} was confirmed for ${expense.name}.`;
      } else if (variant === 3) {
        notificationType = "group_member_joined";
        resourceType = "group";
        resourceId = group.id;
        title = `${actor.name} joined ${group.name}.`;
        body = "The group membership was updated.";
        metadata = {
          performance_namespace: NAMESPACE,
          actor_name: actor.name,
          actor_avatar_color: AVATAR_COLORS[(userIndex + index + 1) % AVATAR_COLORS.length],
          group_name: group.name,
        };
      }

      notifications.push({
        id: stableUuid(`notification:${recipient.id}:${index}`),
        recipient_user_id: recipient.id,
        actor_user_id: actor.id,
        notification_type: notificationType,
        title,
        body,
        group_id: group.id,
        resource_type: resourceType,
        resource_id: resourceId,
        metadata,
        deduplication_key: `${NAMESPACE}:${recipient.id}:${index}`,
        read_at: readAt,
        created_at: createdAt,
      });
    }
  });

  return notifications;
}

async function applyLifecycleExamples(
  admin: ReturnType<typeof createClient<Database>>,
  fixtures: GroupFixture[],
) {
  for (let index = 0; index < fixtures.length; index += 4) {
    const group = fixtures[index];
    const formerMember = [...group.members].reverse().find((member) => member.id !== group.owner.id);
    if (!formerMember) continue;

    const status = index % 8 === 0 ? "left" : "removed";
    const endedAt = isoDaysAgo(5 + index);
    const { error } = await admin
      .from("group_members")
      .update({
        membership_status: status,
        ended_at: endedAt,
        ended_by_user_id: status === "removed" ? group.owner.id : formerMember.id,
      })
      .eq("group_id", group.id)
      .eq("person_id", formerMember.personId);
    if (error) throw formatDbError("Membership lifecycle example", error);
  }

  for (let index = 4; index < fixtures.length; index += 5) {
    const group = fixtures[index];
    const archivedAt = isoDaysAgo(3 + index);
    const { error } = await admin
      .from("groups")
      .update({
        archived_at: archivedAt,
        archived_by_user_id: group.owner.id,
      })
      .eq("id", group.id);
    if (error) throw formatDbError("Archived group example", error);
  }
}

function parsePreset() {
  const presetFlag = process.argv.findIndex((argument) => argument === "--preset");
  const presetName = presetFlag >= 0 ? process.argv[presetFlag + 1] : "realistic";
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset ${presetName}. Use realistic or heavy.`);
  return { preset, presetName };
}

export async function cleanupPerformanceData() {
  const { url, secretKey, expectedRef } = requireEnvironment();
  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Cleaning namespace ${NAMESPACE} from project ${expectedRef}...`);
  const users = (await listAllUsers(admin)).filter(isNamespacedUser);
  const userIds = users.map((user) => user.id);

  const { data: groups, error: groupsError } = await admin
    .from("groups")
    .select("id")
    .like("name", `[PERF ${NAMESPACE}]%`);
  if (groupsError) throw formatDbError("Performance group lookup", groupsError);
  const groupIds = groups.map((group) => group.id);

  if (userIds.length > 0) {
    const { error } = await admin.from("notifications").delete().in("recipient_user_id", userIds);
    if (error) throw formatDbError("Notification cleanup", error);
  }

  if (groupIds.length > 0) {
    const { error: expenseError } = await admin.from("expenses").delete().in("group_id", groupIds);
    if (expenseError) throw formatDbError("Expense cleanup", expenseError);

    const { error: iouError } = await admin.from("ious").delete().in("group_id", groupIds);
    if (iouError) throw formatDbError("IOU cleanup", iouError);

    const { error: groupError } = await admin.from("groups").delete().in("id", groupIds);
    if (groupError) throw formatDbError("Group cleanup", groupError);
  }

  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`Deleting ${user.email ?? user.id} failed: ${error.message}`);
  }

  console.log(`Cleanup complete: ${groupIds.length} groups and ${users.length} users removed.`);
}

export async function seedPerformanceData() {
  const { url, secretKey, password, expectedRef } = requireEnvironment();
  const { preset, presetName } = parsePreset();
  const admin = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Safety checks for Supabase project ${expectedRef}...`);
  await ensureEmptyPerformanceProject(admin);
  console.log(`Seeding ${presetName} performance dataset (${NAMESPACE})...`);

  try {
    const users = await createTestUsers(admin, preset.users, password);
    const { fixtures, groups, groupMembers } = buildGroups(users, preset);
    const data = buildFinancialData(fixtures, preset);
    const notifications = buildNotifications(
      users,
      fixtures,
      data.expenses,
      data.ious,
      preset.notificationsPerUser,
    );

    await insertBatches("Groups", groups, (batch) => admin.from("groups").insert(batch));
    await insertBatches("Group memberships", groupMembers, (batch) =>
      admin.from("group_members").insert(batch),
    );
    await insertBatches("Expenses", data.expenses, (batch) => admin.from("expenses").insert(batch));
    await insertBatches("Expense participants", data.expenseParticipants, (batch) =>
      admin.from("expense_participants").insert(batch),
    );
    await insertBatches("Expense items", data.expenseItems, (batch) =>
      admin.from("expense_items").insert(batch),
    );
    await insertBatches("Item participants", data.itemParticipants, (batch) =>
      admin.from("expense_item_participants").insert(batch),
    );
    await insertBatches("Item add-ons", data.itemAddons, (batch) =>
      admin.from("expense_item_addons").insert(batch),
    );
    await insertBatches("Expense payments", data.expensePayments, (batch) =>
      admin.from("expense_payments").insert(batch),
    );
    await insertBatches("IOUs", data.ious, (batch) => admin.from("ious").insert(batch));
    await insertBatches("IOU payments", data.iouPayments, (batch) =>
      admin.from("iou_payments").insert(batch),
    );
    await applyLifecycleExamples(admin, fixtures);
    await insertBatches("Notifications", notifications, (batch) =>
      admin.from("notifications").insert(batch),
    );

    console.log("\nSeed complete.");
    console.table({
      users: users.length,
      groups: groups.length,
      memberships: groupMembers.length,
      expenses: data.expenses.length,
      expenseParticipants: data.expenseParticipants.length,
      expenseItems: data.expenseItems.length,
      itemAddons: data.itemAddons.length,
      expensePayments: data.expensePayments.length,
      ious: data.ious.length,
      iouPayments: data.iouPayments.length,
      notifications: notifications.length,
    });
    console.log(`Sign in as perf.user01@${EMAIL_DOMAIN} through perf.user${String(users.length).padStart(2, "0")}@${EMAIL_DOMAIN}.`);
    console.log("All test users share the password from PERF_TEST_PASSWORD.");
  } catch (error) {
    console.error("\nSeed stopped. Partial data may exist.");
    console.error("Run npm run cleanup:performance before retrying.");
    throw error;
  }
}

const isDirectRun = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectRun) {
  seedPerformanceData().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
