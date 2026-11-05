"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setProjectMembers } from "@/server/mutations";
import { MultiPicker } from "./combobox";
import { useFormOptions } from "./form-options";

/** Il team di un progetto, modificabile dalla scheda. */
export function ProjectTeam({ projectId, memberIds }: { projectId: string; memberIds: string[] }) {
  const lists = useFormOptions();
  const [value, setValue] = useState(memberIds);
  const [, start] = useTransition();
  return (
    <MultiPicker
      options={lists.users.map((u) => ({ value: u.id, label: u.name }))}
      value={value}
      onChange={(ids) => {
        setValue(ids);
        start(async () => {
          const res = await setProjectMembers(projectId, ids);
          if (!res.ok) toast.error(res.error);
        });
      }}
    />
  );
}
