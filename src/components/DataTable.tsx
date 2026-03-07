"use client";
import { Client } from "@/lib/types";

interface DataTableProps {
  clients: Client[];
  onConfirm: () => void;
  onClear: () => void;
}

export default function DataTable({
  clients,
  onConfirm,
  onClear,
}: DataTableProps) {
  if (clients.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          Review Data ({clients.length} rooms)
        </h3>
        <button
          onClick={onClear}
          className="text-sm text-red-600 underline"
        >
          Clear
        </button>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left">Room</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-center">Adl</th>
              <th className="px-3 py-2 text-center">Chl</th>
              <th className="px-3 py-2 text-left">Package</th>
              <th className="px-3 py-2 text-left">Arrival</th>
              <th className="px-3 py-2 text-left">Departure</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 font-mono font-bold">
                  {c.roomNumber}
                </td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2 text-center">{c.adults}</td>
                <td className="px-3 py-2 text-center">{c.children}</td>
                <td className="px-3 py-2 text-xs">{c.packageCode}</td>
                <td className="px-3 py-2 text-xs">{c.arrivalDate}</td>
                <td className="px-3 py-2 text-xs">{c.departureDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        onClick={onConfirm}
        className="w-full bg-green-600 text-white py-4 rounded-lg text-xl font-bold"
      >
        Confirm & Save ({clients.length} rooms)
      </button>
    </div>
  );
}
