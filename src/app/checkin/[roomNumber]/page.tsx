"use client";
import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Client, CheckInRecord } from "@/lib/types";
import { getTodayData, addCheckIn } from "@/lib/storage";
import { getRemainingForRoom, isComp } from "@/lib/utils";
import PeopleCounter from "@/components/PeopleCounter";

export default function CheckInPage({
  params,
}: {
  params: Promise<{ roomNumber: string }>;
}) {
  const { roomNumber } = use(params);
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [count, setCount] = useState(1);

  useEffect(() => {
    const data = getTodayData();
    if (!data) {
      router.push("/search");
      return;
    }
    const found = data.clients.find((c) => c.roomNumber === roomNumber);
    if (!found) {
      router.push("/search");
      return;
    }
    setClient(found);
    const rem = getRemainingForRoom(found, data.checkIns);
    setRemaining(rem);
    setCount(Math.max(1, rem));
  }, [roomNumber, router]);

  if (!client) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const total = client.adults + client.children;
  const comp = isComp(client);
  const allDone = remaining === 0;

  const handleCheckIn = () => {
    if (count <= 0 || allDone) return;
    const record: CheckInRecord = {
      id: uuidv4(),
      roomNumber: client.roomNumber,
      clientName: client.name,
      peopleEntered: count,
      timestamp: new Date().toISOString(),
    };
    addCheckIn(record);
    router.push("/search");
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto p-4">
      {/* Back button */}
      <button
        onClick={() => router.push("/search")}
        className="self-start text-blue-600 mb-4 flex items-center gap-1"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* Room Number Header */}
      <div className="flex items-center gap-4 mb-6">
        <div>
          <div className="text-sm text-gray-500">Room</div>
          <div className="text-5xl font-bold font-mono">{client.roomNumber}</div>
        </div>
        <div className="space-y-1">
          <div className="text-lg">
            Total = <span className="font-bold">{total}</span>
          </div>
          {comp && (
            <span className="inline-block text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full font-bold">
              COMP
            </span>
          )}
        </div>
      </div>

      {/* Client Name */}
      <h2 className="text-2xl font-bold mb-4">{client.name}</h2>

      {/* Info Boxes */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border">
          <div className="text-xs text-gray-500 uppercase">Adults</div>
          <div className="text-2xl font-bold">{client.adults}</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border">
          <div className="text-xs text-gray-500 uppercase">Children</div>
          <div className="text-2xl font-bold">{client.children}</div>
        </div>
        <div className="bg-white rounded-xl p-3 text-center shadow-sm border">
          <div className="text-xs text-gray-500 uppercase">Package</div>
          <div className="text-sm font-bold mt-1">{client.packageCode}</div>
        </div>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <div className="text-xs text-gray-500 uppercase">Arrival</div>
          <div className="text-base font-medium">{client.arrivalDate}</div>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm border">
          <div className="text-xs text-gray-500 uppercase">Departure</div>
          <div className="text-base font-medium">{client.departureDate}</div>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* All Done State */}
      {allDone ? (
        <div className="text-center py-8">
          <div className="text-2xl font-bold text-green-600 mb-2">
            All Checked In
          </div>
          <p className="text-gray-500">
            All {total} guests from this room have entered.
          </p>
        </div>
      ) : (
        <>
          {/* Remaining info */}
          <div className="text-center text-sm text-gray-500 mb-2">
            {remaining} of {total} remaining
          </div>

          {/* People Counter */}
          <div className="mb-6">
            <PeopleCounter
              value={count}
              min={1}
              max={remaining}
              onChange={setCount}
            />
          </div>

          {/* Check In Button */}
          <button
            onClick={handleCheckIn}
            className="w-full bg-green-600 text-white py-5 rounded-xl text-2xl font-bold active:bg-green-700 transition-colors"
          >
            Check In
          </button>
        </>
      )}
    </div>
  );
}
