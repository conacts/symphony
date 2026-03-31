import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function FoundationTrackCard(input: {
  title: string;
  description: string;
  status: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{input.title}</CardTitle>
        <CardDescription>{input.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          {input.status}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
          <Skeleton className="h-4 w-3/6" />
        </div>
      </CardContent>
    </Card>
  );
}
