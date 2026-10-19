const mongoose = require('mongoose');
const { Schema } = mongoose;

// Serial number life-cycle (the first four come from the Excel drop-down, DISPATCHED is set by the Dispatch module)
const STATUSES = ['RECEIVED', 'INSTALLED', 'UNDER_TESTING', 'SPARE', 'DISPATCHED'];

// A delivery challan (DC) received from the vendor
const Challan = mongoose.model('Challan', new Schema({
  dcNo: { type: String, required: true, unique: true, trim: true },
  date: Date,
  company: { type: String, trim: true },
  recipient: { type: String, trim: true },
  project: { type: String, trim: true },
  notes: { type: String, trim: true },
}, { timestamps: true }));

// A material / equipment type (one row of the challan, or any item that arrives at site)
const Material = mongoose.model('Material', new Schema({
  name: { type: String, required: true, trim: true },
  model: { type: String, trim: true },
  hsn: { type: String, trim: true },
  itemNo: { type: String, trim: true },                       // item number on the challan, e.g. "18.1"
  challan: { type: Schema.Types.ObjectId, ref: 'Challan', index: true },
  challanQty: { type: Number, default: 0, min: 0 },           // quantity written on the challan (0 = not on a challan)
  trackSerial: { type: Boolean, default: true },              // false for cables, kits etc. that only have a quantity
  aliases: [{ type: String, trim: true }],                    // other names used in the delivery tracker
}, { timestamps: true }));

// One line of the Material Delivery Tracker: "on this date, this much arrived"
const Delivery = mongoose.model('Delivery', new Schema({
  material: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
  date: { type: Date, required: true },
  qty: { type: Number, required: true, min: 0 },
  remarks: { type: String, trim: true },
}, { timestamps: true }));

// One physical unit with its serial number (Serial Number Register)
const Serial = mongoose.model('Serial', new Schema({
  material: { type: Schema.Types.ObjectId, ref: 'Material', required: true, index: true },
  serialNo: { type: String, required: true, trim: true },
  serialKey: { type: String, required: true, unique: true },  // upper-case, no spaces: a serial can exist only once
  seq: { type: Number, default: 0 },                          // "Unit 3 of 6" -> 3
  status: { type: String, enum: STATUSES, default: 'RECEIVED' },
  location: { type: String, trim: true },
  remarks: { type: String, trim: true },
  dispatch: { type: Schema.Types.ObjectId, ref: 'Dispatch', index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

// Equipment Dispatch Log / Challan (material sent from site to another place)
const Dispatch = mongoose.model('Dispatch', new Schema({
  date: { type: Date, required: true },
  company: { type: String, trim: true },
  sentTo: { type: String, required: true, trim: true },
  reference: { type: String, trim: true },
  notes: { type: String, trim: true },
  lines: [{
    _id: false,
    material: { type: Schema.Types.ObjectId, ref: 'Material' },
    description: { type: String, trim: true },
    qty: { type: Number, default: 0 },
    serials: [String],
    partNo: { type: String, trim: true },
    date: Date,
    remarks: { type: String, trim: true },
  }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true }));

// Who did what (for the admin "Activity" page)
const Activity = mongoose.model('Activity', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', index: true },
  userName: { type: String, trim: true },
  action: { type: String, enum: ['add', 'edit', 'delete', 'import'], required: true },
  entity: { type: String, required: true },                   // Serial, Delivery, Material, Challan, Dispatch, User
  count: { type: Number, default: 1 },
  text: { type: String, trim: true },
}, { timestamps: true }));

const LEVELS = ['none', 'view', 'edit'];
const User = mongoose.model('User', new Schema({
  name: { type: String, required: true, trim: true },
  username: { type: String, required: true, unique: true, lowercase: true, trim: true },
  email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
  pending: { type: Boolean, default: false },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'engineer', 'user'], default: 'user' },
  active: { type: Boolean, default: true },
  access: { inventory: { type: String, enum: LEVELS } },
}, { timestamps: true }));

module.exports = { Challan, Material, Delivery, Serial, Dispatch, Activity, User, STATUSES };
