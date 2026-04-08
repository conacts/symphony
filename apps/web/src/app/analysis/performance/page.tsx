import { redirect } from "next/navigation";

export default function PerformanceAnalysisPage({
  searchParams
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const nextSearchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string" && value.length > 0) {
      nextSearchParams.set(key, value);
    }
  }

  const query = nextSearchParams.toString();
  redirect(query.length > 0 ? `/?${query}` : "/");
}
