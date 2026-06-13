import mongoose, { Schema, Document, Types } from "mongoose";

export interface ITicket extends Document {
  game: Types.ObjectId;
  user: Types.ObjectId;
  grid: number[][]; // 3×9 matrix, 0 = blank
  markedNumbers: number[];
  createdAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    game: {
      type: Schema.Types.ObjectId,
      ref: "Game",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    grid: {
      type: [[Number]],
      required: true,
      validate: {
        validator: (grid: number[][]) => {
          if (grid.length !== 3) return false;
          for (const row of grid) {
            if (row.length !== 9) return false;
            const numbers = row.filter((n) => n > 0);
            if (numbers.length !== 5) return false;
          }
          return true;
        },
        message: "Grid must be 3×9 with exactly 5 numbers per row",
      },
    },
    markedNumbers: {
      type: [Number],
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes
ticketSchema.index({ game: 1, user: 1 });
ticketSchema.index({ game: 1 });

export const Ticket = mongoose.model<ITicket>("Ticket", ticketSchema);
