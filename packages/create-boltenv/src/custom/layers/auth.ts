import type { CustomSelections, ProjectLayer } from "../types.js";

export function createAuthLayer(selections: CustomSelections): ProjectLayer {
  switch (selections.auth) {
    case "nextauth":
      return createNextAuthLayer(selections);
    case "clerk":
      return createClerkLayer(selections);
    default:
      return { files: {}, dependencies: {}, devDependencies: {}, scripts: {}, envVars: {} };
  }
}

function createNextAuthLayer(selections: CustomSelections): ProjectLayer {
  const hasPrisma =
    selections.database === "postgres-prisma" ||
    selections.database === "sqlite-prisma";

  const authImports = [
    `import NextAuth from "next-auth";`,
    `import GitHub from "next-auth/providers/github";`,
  ];
  const authOptions: string[] = [];

  if (hasPrisma) {
    authImports.push(`import { PrismaAdapter } from "@auth/prisma-adapter";`);
    authImports.push(`import { prisma } from "@/lib/db";`);
    authOptions.push(`  adapter: PrismaAdapter(prisma),`);
  }

  authOptions.push(`  providers: [GitHub],`);

  const authConfig = `${authImports.join("\n")}

export const { handlers, auth, signIn, signOut } = NextAuth({
${authOptions.join("\n")}
});
`;

  const routeHandler = `import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
`;

  const prismaAuthSchema = hasPrisma
    ? `
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  accounts      Account[]
  sessions      Session[]
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
`
    : "";

  const files: Record<string, string> = {
    "src/lib/auth.ts": authConfig,
    "src/app/api/auth/[...nextauth]/route.ts": routeHandler,
  };

  if (prismaAuthSchema) {
    files["prisma/schema.prisma.append"] = prismaAuthSchema;
  }

  const deps: Record<string, string> = {
    "next-auth": "^5.0.0-beta.25",
  };

  if (hasPrisma) {
    deps["@auth/prisma-adapter"] = "^2.7.0";
  }

  return {
    files,
    dependencies: deps,
    devDependencies: {},
    scripts: {},
    envVars: {
      NEXTAUTH_SECRET: "your-secret-key-here",
      NEXTAUTH_URL: "http://localhost:3000",
      AUTH_GITHUB_ID: "your-github-client-id",
      AUTH_GITHUB_SECRET: "your-github-client-secret",
    },
  };
}

function createClerkLayer(selections: CustomSelections): ProjectLayer {
  const isNextjs = selections.frontend === "nextjs";

  const files: Record<string, string> = {};
  const deps: Record<string, string> = {};

  if (isNextjs) {
    deps["@clerk/nextjs"] = "^6.9.0";

    files["src/middleware.ts"] = `import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
`;
  } else {
    deps["@clerk/clerk-react"] = "^5.17.0";
  }

  return {
    files,
    dependencies: deps,
    devDependencies: {},
    scripts: {},
    envVars: {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_...",
      CLERK_SECRET_KEY: "sk_test_...",
    },
  };
}
