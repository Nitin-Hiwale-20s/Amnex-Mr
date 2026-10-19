# ITMS Material Tracker - Samruddhi Mahamarg (Shirdi IC20)

Manages the three Excel files you were using, in one place:

| Excel file | Where it lives in the app |
|---|---|
| AMNEX Material Serial Number Register (+ Challan Summary) | **Challans** (reconciliation), **Materials**, **Serials** |
| Material Delivery Tracker | **Deliveries** |
| Equipment Dispatch Log / Challan | **Dispatch** |

Colourful gaming-style UI with Day / Night mode. Excel and PDF download on every list.

## Run
1. `cd server` then `npm install`
2. Check `server/.env` (MONGODB_URI, JWT_SECRET). The database name is `itms_tracker` (new, separate from the old versions).
3. `npm start`  -> "MongoDB connected" and "Server running"
4. Second terminal: `cd client` then `npm install` then `npm run dev`
5. Open http://localhost:5173 and create the admin account (first visit).
6. Go to **Import**, choose your three Excel files (all together) and press Import.
   (Or from the terminal: `cd server` then `npm run import`, it reads the files in `server/data`.)

One-port mode: `cd client && npm run build`, then run only the server and open http://localhost:5000

## Users and Activity (admin only)
- There is **no self-registration**. Only the admin creates accounts (Users page > Create user) and chooses
  each person's role and access (No access / View / Edit). Nobody else can make an account.
- The **Activity** page shows, for each user, how many records they added (serial numbers, deliveries, materials,
  dispatches, challans), how many edits and deletes they made, and when they were last active.
  Filter by Today / 7 days / 30 days / custom dates, and click a user card to see their full log.
  Activity is recorded from the moment you start using this version.

## How the data fits together
- **Challan** (DC no, date, recipient) has **Materials** (item no, description, model, HSN, challan qty).
- **Deliveries** = each time a material arrives at site (date, qty, remarks).
- **Serials** = each physical unit with its serial number. Status: Received, Installed, Under Testing, Spare, Dispatched.
  A serial number can exist only once in the whole register.
- **Dispatch** = material sent out. Serial numbers in it become Dispatched with the location. Delete the dispatch and they return to Received.
- **Dashboard "Data checks"** shows problems: delivered units without serial numbers, challan quantity not yet delivered,
  more serial numbers than delivered, dispatched serial numbers that are not in the register.

## Import rules
- Importing the same file twice never creates duplicates.
- Tracker rows are matched to challan items by name. Names that do not match become new materials
  (not on any challan). Use a material's "Other names" field to teach the app a different spelling.
- Duplicate serial numbers in the register are skipped and reported.

## MongoDB Atlas problems
- Timed out / IP error: Atlas -> Network Access -> Add IP Address -> Allow access from anywhere (0.0.0.0/0).
- bad auth: check Database Access user and password.
- querySrv ECONNREFUSED / ENOTFOUND: add `DNS_SERVERS=8.8.8.8,1.1.1.1` to `server/.env`.
- Check: http://localhost:5000/api/health should show `"db":true`.
# Amnex-Mr


## Deploy (Render and Vercel)

Needed on BOTH platforms (Environment Variables):

| Key | Value |
|---|---|
| `MONGODB_URI` | Atlas connection string (with database name `itms_tracker`) |
| `JWT_SECRET` | long random string (generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |

Atlas -> Network Access -> Allow access from anywhere (`0.0.0.0/0`), because both platforms use changing IP addresses.

### Render (Web Service, Root Directory = `server`)
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- After deploy open `/api/health` -> should show `"db":true`.

### Vercel (Root Directory = repository root, Framework = Other)
- `vercel.json` already contains the build command, output folder and `/api` routing. Nothing else to configure.
- Add the two Environment Variables, then Deploy.
- Limits on Vercel: a request body can be max 4.5 MB (large Excel imports: use Render, or import with `npm run import` from your computer), and a function runs max 60 seconds.
# Amnex-
