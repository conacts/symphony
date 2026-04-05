"use client";

import Link from "next/link";
import React from "react";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";

export type ControlPlaneBreadcrumbItem = {
  label: string;
  href?: string;
};

export function ControlPlaneBreadcrumbs(input: {
  items: ControlPlaneBreadcrumbItem[];
}) {
  if (input.items.length === 0) {
    return null;
  }

  const lastIndex = input.items.length - 1;
  const collapseMiddle = input.items.length > 3;

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="min-w-0 flex-nowrap whitespace-nowrap">
        {input.items.map((item, index) => {
          const isFirst = index === 0;
          const isLast = index === lastIndex;
          const isMiddle = !isFirst && !isLast;

          return (
            <React.Fragment key={`${item.label}:${item.href ?? "current"}:${index}`}>
              <BreadcrumbItem
                className={collapseMiddle && isMiddle ? "hidden md:inline-flex" : "min-w-0"}
              >
                {isLast || !item.href ? (
                  <BreadcrumbPage className="max-w-[9rem] truncate md:max-w-[14rem]">
                    {item.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} className="max-w-[8rem] truncate md:max-w-[12rem]">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {index === lastIndex ? null : (
                <BreadcrumbSeparator
                  className={collapseMiddle && isMiddle ? "hidden md:block" : undefined}
                />
              )}
              {collapseMiddle && index === 0 ? (
                <>
                  <BreadcrumbItem className="md:hidden">
                    <BreadcrumbEllipsis />
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="md:hidden" />
                </>
              ) : null}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
