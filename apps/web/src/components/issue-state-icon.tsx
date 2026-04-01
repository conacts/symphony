"use client";

import type { ComponentProps } from "react";
import {
  BadgeCheckIcon,
  BanIcon,
  CircleCheckBigIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleHelpIcon,
  CircleXIcon,
  CopyIcon,
  EyeIcon,
  RefreshCcwIcon,
  TriangleAlertIcon
} from "lucide-react";

type IssueStateIconProps = ComponentProps<typeof CircleHelpIcon> & {
  state: string;
};

export function IssueStateIcon({
  state,
  ...props
}: IssueStateIconProps) {
  const Icon = getIssueStateIcon(state);

  return <Icon aria-hidden="true" focusable="false" {...props} />;
}

function getIssueStateIcon(state: string) {
  switch (normalizeIssueState(state)) {
    case "todo":
      return CircleDashedIcon;
    case "in progress":
      return CircleDotIcon;
    case "in review":
      return EyeIcon;
    case "approved":
      return BadgeCheckIcon;
    case "rework":
      return RefreshCcwIcon;
    case "blocked":
      return TriangleAlertIcon;
    case "done":
      return CircleCheckBigIcon;
    case "duplicate":
      return CopyIcon;
    case "canceled":
    case "cancelled":
      return BanIcon;
    case "closed":
      return CircleXIcon;
    case "backlog":
    default:
      return CircleHelpIcon;
  }
}

function normalizeIssueState(state: string): string {
  return state.trim().toLowerCase().replace(/[\s_-]+/gu, " ");
}
