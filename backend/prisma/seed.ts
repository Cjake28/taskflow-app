/**
 * Demo data: `npm run db:seed` (safe to re-run — it replaces the two demo accounts).
 *
 *   demo@taskflow.dev / Demo@12345!   ~24 tasks, activity history, avatar, task images
 *   alex@taskflow.dev / Alex@12345!   a few tasks and one image (to try cross-user access)
 *
 * Due dates are relative to "now" in this machine's time zone. Images are
 * generated with sharp and stored through the configured storage driver.
 */
import 'dotenv/config';
import sharp from 'sharp';
import { hashPassword } from '../src/common/utils/password';
import { createContainer, type Container } from '../src/container';
import type { Prisma } from '../src/generated/prisma/client';

type Status = 'TODO' | 'IN_PROGRESS' | 'COMPLETED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

interface SeedTask {
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  /** Days from today; undefined = no due date. */
  dueInDays?: number;
  /** Local time `HH:mm`; without it the task is due at the end of the day. */
  dueTime?: string;
  /** How long ago the task was created, in days. */
  createdDaysAgo: number;
  /** For completed tasks: days ago it was completed. */
  completedDaysAgo?: number;
  /** Generated images to attach (colour pairs). */
  images?: Array<[string, string]>;
}

const DEMO_TASKS: SeedTask[] = [
  {
    title: 'Fix login redirect loop on Safari',
    description:
      'Users on Safari 18 get bounced between /login and /dashboard after the session refresh. Reproduce with a private window and check the SameSite cookie behaviour.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueInDays: -2,
    createdDaysAgo: 6,
  },
  {
    title: 'Submit Q3 expense report',
    description: 'Receipts are in the shared Finance folder. Deadline was extended once already.',
    status: 'TODO',
    priority: 'MEDIUM',
    dueInDays: -1,
    createdDaysAgo: 9,
  },
  {
    title: 'Reply to design review comments',
    status: 'TODO',
    priority: 'LOW',
    dueInDays: -3,
    createdDaysAgo: 5,
  },
  {
    title: 'Prepare sprint demo slides',
    description:
      'Cover the new board view, image uploads and the dashboard. Keep it under 10 minutes.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueInDays: 0,
    dueTime: '16:00',
    createdDaysAgo: 3,
    images: [['#5B5BF0', '#8B5CF6']],
  },
  {
    title: 'Review pull request #128',
    description: 'Refactor of the notification service. Focus on the retry logic.',
    status: 'TODO',
    priority: 'MEDIUM',
    dueInDays: 0,
    createdDaysAgo: 1,
  },
  {
    title: 'Book dentist appointment',
    status: 'TODO',
    priority: 'LOW',
    dueInDays: 0,
    dueTime: '18:30',
    createdDaysAgo: 2,
  },
  {
    title: 'Write onboarding checklist for new hires',
    description: 'Accounts to create, repos to clone, the first-week reading list and who to meet.',
    status: 'TODO',
    priority: 'MEDIUM',
    dueInDays: 2,
    createdDaysAgo: 4,
  },
  {
    title: 'Update API rate limit docs',
    status: 'TODO',
    priority: 'LOW',
    dueInDays: 3,
    createdDaysAgo: 8,
  },
  {
    title: 'Design empty states for mobile',
    description:
      'Two variants: "No tasks yet" and "No results". Follow the illustration style from the web app.',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueInDays: 4,
    createdDaysAgo: 7,
    images: [
      ['#F28B22', '#F04E6A'],
      ['#14B87F', '#5B5BF0'],
      ['#8B5CF6', '#F28B22'],
    ],
  },
  {
    title: 'Plan customer interview questions',
    description: 'Ten open questions about how teams plan their week. Avoid leading questions.',
    status: 'TODO',
    priority: 'HIGH',
    dueInDays: 5,
    dueTime: '10:00',
    createdDaysAgo: 2,
  },
  {
    title: 'Migrate CI to GitHub Actions',
    description: 'Postgres and Redis service containers, cache npm, run lint, typecheck and tests.',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    dueInDays: 6,
    createdDaysAgo: 10,
  },
  {
    title: 'Research offline sync options',
    status: 'TODO',
    priority: 'LOW',
    dueInDays: 14,
    createdDaysAgo: 12,
  },
  {
    title: 'Draft Q4 OKRs',
    description: 'Three objectives max. Share the draft with the team before the planning session.',
    status: 'TODO',
    priority: 'MEDIUM',
    dueInDays: 21,
    createdDaysAgo: 3,
  },
  {
    title: 'Refactor the notification service',
    status: 'TODO',
    priority: 'MEDIUM',
    dueInDays: 30,
    createdDaysAgo: 11,
  },
  {
    title: 'Organise the shared Drive folders',
    status: 'TODO',
    priority: 'LOW',
    createdDaysAgo: 14,
  },
  {
    title: 'Read "Designing Data-Intensive Applications", chapter 5',
    status: 'IN_PROGRESS',
    priority: 'LOW',
    createdDaysAgo: 13,
  },
  {
    title: 'Collect testimonials for the landing page',
    description: 'Ask the five pilot teams for a short quote and permission to use their logo.',
    status: 'TODO',
    priority: 'MEDIUM',
    createdDaysAgo: 6,
    images: [['#14B87F', '#8B5CF6']],
  },
  {
    title: 'Set up error monitoring',
    description: 'Alerts for 5xx spikes and failed background jobs.',
    status: 'COMPLETED',
    priority: 'HIGH',
    dueInDays: -1,
    createdDaysAgo: 9,
    completedDaysAgo: 1,
  },
  {
    title: 'Book the venue for the team offsite',
    status: 'COMPLETED',
    priority: 'MEDIUM',
    dueInDays: -2,
    createdDaysAgo: 12,
    completedDaysAgo: 2,
    images: [['#F28B22', '#14B87F']],
  },
  {
    title: 'Renew SSL certificates',
    status: 'COMPLETED',
    priority: 'HIGH',
    dueInDays: -3,
    createdDaysAgo: 15,
    completedDaysAgo: 4,
  },
  {
    title: 'Clean up unused feature flags',
    status: 'COMPLETED',
    priority: 'LOW',
    createdDaysAgo: 16,
    completedDaysAgo: 6,
  },
  {
    title: 'Draft release notes for v2.3',
    status: 'COMPLETED',
    priority: 'MEDIUM',
    dueInDays: -9,
    createdDaysAgo: 18,
    completedDaysAgo: 10,
  },
  {
    title: 'Accessibility audit of the settings page',
    description: 'Keyboard navigation, focus order, contrast and screen reader labels.',
    status: 'COMPLETED',
    priority: 'HIGH',
    createdDaysAgo: 20,
    completedDaysAgo: 12,
  },
  {
    title: 'Update the team wiki homepage',
    status: 'COMPLETED',
    priority: 'LOW',
    createdDaysAgo: 22,
    completedDaysAgo: 15,
  },
];

const ALEX_TASKS: SeedTask[] = [
  {
    title: "Alex's private roadmap notes",
    description: 'Only Alex can see this task. Try opening its URL while signed in as demo.',
    status: 'TODO',
    priority: 'HIGH',
    dueInDays: 3,
    createdDaysAgo: 2,
    images: [['#F04E6A', '#8B5CF6']],
  },
  {
    title: 'Prepare the budget review',
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    dueInDays: 1,
    createdDaysAgo: 4,
  },
  {
    title: 'Send the vendor contract',
    status: 'COMPLETED',
    priority: 'LOW',
    createdDaysAgo: 6,
    completedDaysAgo: 1,
  },
];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function dueDateFor(task: SeedTask, now: Date): { dueDate: Date | null; hasDueTime: boolean } {
  if (task.dueInDays === undefined) return { dueDate: null, hasDueTime: false };
  const day = new Date(now);
  day.setDate(day.getDate() + task.dueInDays);
  if (task.dueTime) {
    const [hours, minutes] = task.dueTime.split(':').map(Number);
    day.setHours(hours ?? 0, minutes ?? 0, 0, 0);
    return { dueDate: day, hasDueTime: true };
  }
  // Same convention as the web app: an all-day task is due at the end of that local day.
  day.setHours(23, 59, 59, 999);
  return { dueDate: day, hasDueTime: false };
}

/** A soft gradient "photo" with a few shapes — a placeholder that still looks like an image. */
function placeholderImage([from, to]: [string, string], seed: number): Promise<Buffer> {
  const circles = Array.from({ length: 4 }, (_, i) => {
    const x = (seed * 97 + i * 211) % 1200;
    const y = (seed * 53 + i * 149) % 800;
    const r = 60 + ((seed + i * 37) % 140);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" fill-opacity="${0.08 + i * 0.04}"/>`;
  }).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>${circles}
    <path d="M0 640 L260 470 L470 610 L720 400 L1200 690 L1200 800 L0 800 Z" fill="#ffffff" fill-opacity="0.18"/>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

function avatarImage([from, to]: [string, string]): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs><radialGradient id="g" cx="0.3" cy="0.25" r="0.9">
      <stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>
    </radialGradient></defs>
    <rect width="512" height="512" fill="url(#g)"/>
    <circle cx="256" cy="210" r="92" fill="#ffffff" fill-opacity="0.9"/>
    <path d="M86 512 C110 380 190 330 256 330 C322 330 402 380 426 512 Z" fill="#ffffff" fill-opacity="0.9"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function removeExisting(c: Container, email: string): Promise<void> {
  const user = await c.prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return;
  const images = await c.prisma.image.findMany({
    where: { ownerId: user.id },
    select: { storageKey: true, thumbKey: true },
  });
  await c.storage.delete(
    images.flatMap((image) =>
      image.thumbKey ? [image.storageKey, image.thumbKey] : [image.storageKey],
    ),
  );
  await c.prisma.user.delete({ where: { id: user.id } });
}

async function seedUser(
  c: Container,
  account: {
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    password: string;
  },
  tasks: SeedTask[],
  avatarColours: [string, string] | null,
): Promise<void> {
  await removeExisting(c, account.email);
  const now = new Date();
  const user = await c.prisma.user.create({
    data: {
      firstName: account.firstName,
      lastName: account.lastName,
      username: account.username,
      email: account.email,
      // Seed passwords skip the breached-password check on purpose.
      passwordHash: await hashPassword(account.password),
      emailVerifiedAt: now,
      createdAt: new Date(now.getTime() - 30 * DAY),
    },
  });

  if (avatarColours) {
    await c.images.setAvatar(user.id, {
      buffer: await avatarImage(avatarColours),
      originalName: 'avatar.png',
    });
  }

  const positions: Record<Status, number> = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0 };
  let imageSeed = 1;

  for (const task of tasks) {
    const createdAt = new Date(now.getTime() - task.createdDaysAgo * DAY);
    const completedAt =
      task.status === 'COMPLETED'
        ? new Date(now.getTime() - (task.completedDaysAgo ?? 1) * DAY + 3 * HOUR)
        : null;
    const startedAt =
      task.status === 'IN_PROGRESS' ? new Date(createdAt.getTime() + 5 * HOUR) : null;
    const lastChange = completedAt ?? startedAt ?? createdAt;
    const { dueDate, hasDueTime } = dueDateFor(task, now);

    const created = await c.prisma.task.create({
      data: {
        userId: user.id,
        title: task.title,
        description: task.description ?? null,
        status: task.status,
        priority: task.priority,
        dueDate,
        hasDueTime,
        completedAt,
        position: positions[task.status]++,
        createdAt,
        updatedAt: lastChange,
      },
    });

    const history: Prisma.TaskActivityCreateManyInput[] = [
      { userId: user.id, taskId: created.id, taskTitle: task.title, action: 'CREATED', createdAt },
    ];
    if (startedAt) {
      history.push({
        userId: user.id,
        taskId: created.id,
        taskTitle: task.title,
        action: 'STATUS_CHANGED',
        changes: { status: { from: 'TODO', to: 'IN_PROGRESS' } },
        createdAt: startedAt,
      });
    }
    if (completedAt) {
      history.push({
        userId: user.id,
        taskId: created.id,
        taskTitle: task.title,
        action: 'STATUS_CHANGED',
        changes: { status: { from: 'IN_PROGRESS', to: 'COMPLETED' } },
        createdAt: completedAt,
      });
    }
    if (task.priority === 'HIGH' && task.status !== 'COMPLETED') {
      history.push({
        userId: user.id,
        taskId: created.id,
        taskTitle: task.title,
        action: 'UPDATED',
        changes: { priority: { from: 'MEDIUM', to: 'HIGH' } },
        createdAt: new Date(createdAt.getTime() + 2 * HOUR),
      });
    }
    await c.prisma.taskActivity.createMany({ data: history });

    if (task.images?.length) {
      const uploads = await Promise.all(
        task.images.map(async (colours, index) => ({
          buffer: await placeholderImage(colours, imageSeed++),
          originalName: `${task.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .slice(0, 40)}-${index + 1}.jpg`,
        })),
      );
      await c.images.addTaskImages(user.id, created.id, uploads);
      // Put the upload in the task's past rather than "now", so the feed reads naturally.
      const addedAt = new Date(createdAt.getTime() + HOUR);
      await c.prisma.image.updateMany({
        where: { taskId: created.id },
        data: { createdAt: addedAt },
      });
      await c.prisma.taskActivity.updateMany({
        where: { taskId: created.id, action: 'IMAGE_ADDED' },
        data: { createdAt: addedAt },
      });
      await c.prisma.task.update({ where: { id: created.id }, data: { updatedAt: lastChange } });
    }
  }
}

async function main(): Promise<void> {
  const c = await createContainer({ jobs: 'inline' });
  try {
    await seedUser(
      c,
      {
        firstName: 'Demo',
        lastName: 'User',
        username: 'demo',
        email: 'demo@taskflow.dev',
        password: 'Demo@12345!',
      },
      DEMO_TASKS,
      ['#8B5CF6', '#5B5BF0'],
    );
    await seedUser(
      c,
      {
        firstName: 'Alex',
        lastName: 'Rivera',
        username: 'alex',
        email: 'alex@taskflow.dev',
        password: 'Alex@12345!',
      },
      ALEX_TASKS,
      null,
    );
    console.log('Seeded demo data:');
    console.log('  demo@taskflow.dev / Demo@12345!');
    console.log('  alex@taskflow.dev / Alex@12345!');
  } finally {
    await c.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
