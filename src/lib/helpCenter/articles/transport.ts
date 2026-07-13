import type { HelpArticle } from "../types";

export const transportArticles: HelpArticle[] = [
  {
    slug: "routes-and-stops",
    title: "Setting up routes and stops",
    summary: "Define the bus routes your school runs and the stops each one serves.",
    popular: true,
    keywords: ["routes", "stops", "bus route", "pickup", "drop-off"],
    content: `
A **route** is the backbone of the Transport module — everything else (vehicles, drivers, student allocation) attaches to a route, so setting these up correctly first saves rework later.

## Creating a route

From **Transport → Routes**, click **Add Route** and give it a name (e.g. "Route 4 — Riverside") and a direction (Pickup, Drop-off, or both if your school runs the same path both ways). A route is really just an ordered list of stops with approximate timings.

## Adding stops

Within a route, add each stop with its name/location and an estimated arrival time. Stops should be listed in the actual order the bus travels them — this ordering is what later drives the estimated-time display for parents and what a driver sees on their own device.

## Editing an existing route

Routes change as neighborhoods and enrollment shift. You can add, remove, or reorder stops on an existing route at any time; students already allocated to that route keep their assignment, they just inherit whatever the route now looks like.

> **Tip:** Keep route names and numbers consistent with what's printed on the physical bus and used by drivers on the ground — a mismatch between the system's route name and the sign on the bus is a common source of parent confusion.

## Capacity planning

Each route effectively has a capacity ceiling set by whichever vehicle is assigned to it (see **Managing the vehicle fleet**). When allocating students, keep an eye on how many are already on a route relative to the assigned vehicle's seating capacity.
`,
  },
  {
    slug: "vehicle-fleet",
    title: "Managing the vehicle fleet",
    summary: "Register buses and vans, track capacity, and keep documents like insurance and permits current.",
    popular: true,
    keywords: ["vehicles", "fleet", "bus", "capacity", "maintenance", "insurance"],
    content: `
**Transport → Vehicles** is your fleet register — every bus or van your school operates, along with the details you need for compliance and day-to-day assignment decisions.

## Registering a vehicle

Add a vehicle with its registration/plate number, type (bus, van, etc.), and seating capacity. Capacity matters beyond record-keeping — it's the practical ceiling on how many students can be allocated to any route that vehicle serves.

## Assigning a vehicle to a route

A vehicle is linked to one or more routes it runs. Once assigned, the route's effective capacity follows the vehicle — swapping in a smaller or larger vehicle changes how many students that route can carry without needing to rebuild the route itself.

## Tracking documents and maintenance

Record insurance expiry, permit/registration renewal dates, and maintenance history against each vehicle. Keeping these current here means your transport coordinator has one place to check before a vehicle goes back on the road, rather than relying on paper files.

## Retiring a vehicle

If a vehicle is sold, decommissioned, or out of service long-term, mark it inactive rather than deleting it — this preserves its history (which routes it served, past maintenance) while removing it from the pool of vehicles available for new assignments.
`,
  },
  {
    slug: "driver-assignment",
    title: "Assigning drivers to routes",
    summary: "Register drivers and match them to the routes and vehicles they operate.",
    keywords: ["driver", "assignment", "conductor", "license"],
    content: `
Drivers are tracked separately from vehicles and routes so the same driver can be reassigned if a vehicle is swapped, or a substitute can cover a route without disturbing the route/vehicle setup itself.

## Adding a driver

From **Transport → Drivers**, register each driver with their name, contact number, and license details. If your school also tracks conductors/attendants, add them the same way.

## Linking a driver to a route

Assign a driver to the route (and by extension the vehicle) they normally operate. This assignment is what shows up wherever a route is displayed — to your transport coordinator, and to parents checking who's driving their child's bus.

## Handling substitutions

When a regular driver is unavailable, update the assignment to a substitute driver for the affected day/period rather than editing the route itself — this keeps a clear record of who actually drove a route on any given day, which matters if an incident needs to be investigated later.

> **Tip:** Keep license expiry dates on the driver record current; a driver whose license is close to expiry is worth flagging before it becomes a compliance problem.
`,
  },
  {
    slug: "student-transport-allocation",
    title: "Allocating students to bus routes",
    summary: "Assign individual students to a route and stop, and manage changes through the year.",
    popular: true,
    keywords: ["allocation", "student transport", "pickup point", "assign student", "transport fee"],
    content: `
Once routes and stops exist, **Student Transport Allocation** is where you connect an actual student to the service — which route they ride and which stop they board/alight at.

## Allocating a student

Search for the student (by name, admission number, or grade/section) and assign them to a route and a specific stop on that route. A student can only be allocated to one route per direction at a time, which keeps pickup/drop-off unambiguous for drivers.

## Changing a student's stop or route

Families move, or a stop becomes inconvenient — update the allocation directly rather than removing and re-adding the student. The change takes effect from the date you set, so history of where a student boarded on past dates isn't rewritten.

## Transport fees

Allocating a student to a route is what makes the transport fee apply to their account — see the **Finance** module's Fees Management article for how transport fees are invoiced alongside tuition. Removing a student from a route stops future transport charges but doesn't erase already-invoiced amounts.

## Checking route load

Before allocating a new student, check how many students are already on that route against the assigned vehicle's capacity (see **Managing the vehicle fleet**) — the allocation screen shows current occupancy so you don't overload a bus by accident.
`,
  },
  {
    slug: "live-tracking-monitoring",
    title: "Monitoring transport with live tracking",
    summary: "See where buses are in real time and how parents get the same visibility.",
    keywords: ["live tracking", "gps", "monitoring", "map", "eta"],
    content: `
**Live Tracking** gives your transport coordinator a real-time map view of active routes, so bus locations and delays are visible from a single screen rather than relying on phone calls to drivers.

## What you see

Active vehicles appear on the map along with their assigned route, current stop progress, and an estimated arrival time for remaining stops. This is the same underlying position data that powers the "where's the bus" view in the Parent Portal, so what you see on the admin map matches what a parent sees for their own child's bus.

## Handling a delay

If a route is running late, the system reflects it automatically as the vehicle's actual position falls behind the stop schedule — you don't need to manually flag a delay for parents to see updated ETAs.

## Incident review

Because position history is retained, you can look back at a completed run to confirm timing if a parent raises a concern (e.g. "the bus never came") — actual stop-arrival times are on record rather than being a he-said/she-said situation.

> **Tip:** Live tracking depends on a GPS-enabled device being active on the vehicle for that trip; a route with no tracking data usually means the device wasn't switched on, not a system fault.
`,
  },
  {
    slug: "transport-notifications-safety",
    title: "Transport notifications and safety checks",
    summary: "Keep parents informed automatically and run basic safety checks like boarding confirmation.",
    keywords: ["notifications", "safety", "boarding", "alerts", "parent updates"],
    content: `
Beyond live tracking, the Transport module can keep parents informed automatically and give your team a lightweight safety check on boarding.

## Automatic parent notifications

Depending on your school's configuration, parents can receive a notification when their child's bus is approaching their stop, and/or when a student boards or alights (if boarding confirmation is enabled). This reduces the volume of "where is the bus" calls to your front office.

## Boarding confirmation

If your school uses boarding confirmation (via driver/conductor check-in or a card/tag scan), each student's boarding and alighting is logged per trip. This creates a simple daily record of who actually rode the bus, useful alongside regular attendance records.

## Reviewing missed pickups

If a student was allocated to a route but wasn't marked as boarded, this shows up as an exception your transport coordinator can follow up on — either the student didn't ride that day, or something needs correcting in the allocation.

See the **Communication** module for how transport alerts fit alongside other school-to-parent notifications.
`,
  },
];
