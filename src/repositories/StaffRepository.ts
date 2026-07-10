import { BaseRepository } from "./base/Repository";
import { Staff } from "@/types";

// Replaces direct fetch("/api/data/staff") call sites across the app.
export class StaffRepository extends BaseRepository<Staff> {
  constructor() {
    super("staff");
  }
}

export const staffRepository = new StaffRepository();
