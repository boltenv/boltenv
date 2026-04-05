import { api } from "@/trpc/server";

export default async function Home() {
  const latestPost = await api.post.getLatest();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#2e026d] to-[#15162c] text-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-[5rem]">
          Create <span className="text-[hsl(280,100%,70%)]">T3</span> App
        </h1>
        <div className="flex flex-col items-center gap-2">
          <p className="text-2xl text-white">
            {latestPost
              ? `Your most recent post: ${latestPost.name}`
              : "You have no posts yet."}
          </p>
        </div>
      </div>
    </main>
  );
}
