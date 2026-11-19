/**
 * PostgreSQL schema. Each migration runs once, in order, inside a transaction.
 * Never edit a migration that has shipped; append a new one.
 *
 * Every table has an `extra` jsonb column. It holds anything in a legacy
 * Firestore document that doesn't fit the typed columns (unknown keys, values
 * of an unexpected type, explicit nulls), so the import is lossless. For data
 * written by the app it stays empty.
 *
 * Dates stay as ISO "YYYY-MM-DD" text, as in Firestore: existing records
 * contain empty strings (e.g. no expected return date), which a DATE column
 * can't hold. ISO strings still sort and compare correctly.
 */
export const SCHEMA_MIGRATIONS: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE categories (
        id    text PRIMARY KEY,
        name  text,
        extra jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
      `CREATE TABLE departments (
        id    text PRIMARY KEY,
        name  text,
        extra jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
      `CREATE TABLE staff_members (
        id                text PRIMARY KEY,
        name              text,
        email             text,
        department        text,
        employment_status text CHECK (employment_status IN ('Full-Time','Part-Time','Contractor','Intern','On Leave','Offboarded')),
        avatar_url        text,
        extra             jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
      `CREATE INDEX staff_members_email_idx ON staff_members (lower(email))`,
      `CREATE TABLE devices (
        id            text PRIMARY KEY,
        name          text,
        model         text,
        serial_number text,
        category      text,
        status        text CHECK (status IN ('available','loaned','maintenance','retired')),
        condition     text CHECK (condition IN ('Excellent','Good','Fair','Needs Service')),
        purchase_date text,
        location      text,
        image         text,
        notes         text,
        extra         jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
      `CREATE INDEX devices_status_idx ON devices (status)`,
      `CREATE INDEX devices_category_idx ON devices (category)`,
      `CREATE INDEX devices_serial_idx ON devices (serial_number)`,
      // A device's loan history (slot='history', ordered by position, newest
      // first as the app keeps it) and its active loan (slot='current',
      // position 0). The app stores the active loan as a copy of a history
      // entry; both are kept so the device record reads back exactly.
      `CREATE TABLE loan_records (
        device_id            text NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        slot                 text NOT NULL CHECK (slot IN ('history','current')),
        position             integer NOT NULL,
        id                   text,
        loan_device_id       text,
        user_id              text,
        user_name            text,
        user_email           text,
        user_department      text,
        checkout_date        text,
        expected_return_date text,
        returned_date        text,
        notes                text,
        status               text CHECK (status IN ('active','returned','overdue')),
        condition_on_return  text CHECK (condition_on_return IN ('Excellent','Good','Fair','Needs Service')),
        extra                jsonb NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (device_id, slot, position),
        CHECK (slot = 'history' OR position = 0)
      )`,
      `CREATE INDEX loan_records_user_idx ON loan_records (user_id)`,
      `CREATE INDEX loan_records_status_idx ON loan_records (status)`,
      `CREATE TABLE subscriptions (
        id             text PRIMARY KEY,
        name           text,
        url            text,
        username       text,
        password       text,
        renewal_date   text,
        remarks        text,
        category       text,
        cost           double precision,
        billing_cycle  text,
        contact_person text,
        status         text,
        extra          jsonb NOT NULL DEFAULT '{}'::jsonb
      )`,
      `CREATE INDEX subscriptions_renewal_idx ON subscriptions (renewal_date)`,
    ],
  },
];
