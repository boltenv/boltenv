import type { CustomSelections, ProjectLayer } from "../types.js";
import { hasBackendServer } from "../types.js";

export function createDatabaseLayer(selections: CustomSelections): ProjectLayer {
  switch (selections.database) {
    case "postgres-prisma":
      return createPrismaLayer(selections, "postgresql");
    case "sqlite-prisma":
      return createPrismaLayer(selections, "sqlite");
    case "mongodb":
      return createMongoLayer(selections);
    default:
      return { files: {}, dependencies: {}, devDependencies: {}, scripts: {}, envVars: {} };
  }
}

function createPrismaLayer(
  selections: CustomSelections,
  provider: "postgresql" | "sqlite",
): ProjectLayer {
  const serverSide = hasBackendServer(selections);
  const prefix = serverSide ? "server/" : "";

  const dbUrl = provider === "postgresql"
    ? "postgresql://user:password@localhost:5432/mydb?schema=public"
    : "file:./dev.db";

  const schema = `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "${provider}"
  url      = env("DATABASE_URL")
}

model Item {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
`;

  const dbClient = `import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
`;

  const files: Record<string, string> = {
    [`${prefix}prisma/schema.prisma`]: schema,
    [`${prefix}src/lib/db.ts`]: dbClient,
  };

  const deps: Record<string, string> = {
    "@prisma/client": "^6.1.0",
  };

  const devDeps: Record<string, string> = {
    prisma: "^6.1.0",
  };

  const scripts: Record<string, string> = serverSide
    ? {}
    : {
        "db:push": "prisma db push",
        "db:studio": "prisma studio",
        "db:generate": "prisma generate",
      };

  return {
    files,
    dependencies: deps,
    devDependencies: devDeps,
    scripts,
    envVars: {
      DATABASE_URL: dbUrl,
    },
  };
}

function createMongoLayer(selections: CustomSelections): ProjectLayer {
  const serverSide = hasBackendServer(selections);
  const prefix = serverSide ? "server/" : "";

  const mongoClient = `import mongoose from "mongoose";

const MONGODB_URI = process.env["MONGODB_URI"];

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI environment variable is not set");
}

let cached = (globalThis as Record<string, unknown>).__mongoose as {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
} | undefined;

if (!cached) {
  cached = { conn: null, promise: null };
  (globalThis as Record<string, unknown>).__mongoose = cached;
}

export async function connectDB(): Promise<typeof mongoose> {
  if (cached!.conn) return cached!.conn;

  if (!cached!.promise) {
    cached!.promise = mongoose.connect(MONGODB_URI!);
  }

  cached!.conn = await cached!.promise;
  return cached!.conn;
}
`;

  const itemModel = `import mongoose, { Schema, type Document } from "mongoose";

export interface IItem extends Document {
  readonly name: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const ItemSchema = new Schema<IItem>(
  {
    name: { type: String, required: true },
  },
  { timestamps: true },
);

export const Item = mongoose.models["Item"] as mongoose.Model<IItem>
  ?? mongoose.model<IItem>("Item", ItemSchema);
`;

  return {
    files: {
      [`${prefix}src/lib/mongodb.ts`]: mongoClient,
      [`${prefix}src/models/item.ts`]: itemModel,
    },
    dependencies: {
      mongoose: "^8.9.0",
    },
    devDependencies: {},
    scripts: {},
    envVars: {
      MONGODB_URI: "mongodb://localhost:27017/mydb",
    },
  };
}
