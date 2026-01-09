//These schemas act as a security and quality gate at this API boundary.

const { z } = require("zod"); //imports Zod schema validation library

const roleSchema = z.enum(["Citizen", "Administrator"]); //defines allowed users
const categorySchema = z.enum([
  "Water Supply",
  "Waste Management",
  "Road Maintenance",
  "Street Lighting",
  "Traffic & Safety",
]); //restrict request category
const statusSchema = z.enum(["Pending", "In Progress", "Resolved", "Rejected"]);
const prioritySchema = z.enum(["Low", "Medium", "High", "Critical"]);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(3).max(150),
  phoneNumber: z.string().min(9).max(20),
  address: z.string().min(10).max(200),
  role: roleSchema,
}); //validates email in email format, password a minimum of 8 char., fullname with min and max char value, phonenumber limits length, role must match roleschema

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const createRequestSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: categorySchema,
  location: z.string().min(5).max(200),
  imagePath: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: statusSchema,
  note: z.string().max(500).optional(), // optional progress note
});

module.exports = {
  registerSchema,
  loginSchema,
  createRequestSchema,
  updateStatusSchema,
  statusSchema,
}; //Exports the schemas so the routes can use them to validate incoming requests before performing database operations.
