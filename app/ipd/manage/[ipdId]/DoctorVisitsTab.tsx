"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Stethoscope, Clock, UserCheck, Trash2, RefreshCw } from "lucide-react";

interface SingleDoctorVisitEntry {
  tempId: string;
  doctorName: string;
  dateTime: string;
  deletedBy?: string;
  deletedAt?: string;
}
interface ManageDoctorVisitsRow {
  id: string;
  ipd_id: number;
  uhid: string;
  doctor_visit_Data: SingleDoctorVisitEntry[];
  entered_by: string[] | null;
  created_at?: string;
  updated_at?: string;
  deleted_data?: { deletedBy: string; deletedAt: string } | null;
}
interface DoctorVisitFormInputs {
  doctorName: string;
  dateTime: string;
}

export default function DoctorVisits() {
  const { ipdId } = useParams<{ ipdId: string }>();
  const [visitsDataRow, setVisitsDataRow] = useState<ManageDoctorVisitsRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const channelRef = useRef<any>(null);

  const getCurrentDateTimeLocal = useCallback(() => {
    const now = new Date();
    return format(now, "yyyy-MM-dd'T'HH:mm");
  }, []);
  const { register, handleSubmit, reset } = useForm<DoctorVisitFormInputs>({
    defaultValues: {
      doctorName: "",
      dateTime: getCurrentDateTimeLocal(),
    },
  });

  // Fetch data by ipd_id
  const fetchVisitsByIpdId = useCallback(async () => {
    if (!ipdId) {
      setVisitsDataRow(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const ipdNum = Number(ipdId);
    try {
      const { data, error } = await supabase
        .from("manage_doctor_visits")
        .select("*")
        .eq("ipd_id", ipdNum)
        .is("deleted_data", null)
        .single();
      if (error && error.code !== "PGRST116") {
        setVisitsDataRow(null);
      } else if (data) {
        setVisitsDataRow(data as ManageDoctorVisitsRow);
      } else {
        setVisitsDataRow(null);
      }
    } catch (error: any) {
      setVisitsDataRow(null);
    }
    setIsLoading(false);
  }, [ipdId]);

  // Setup subscription on the PK (id), but always refetch if change is detected
  useEffect(() => {
    let lastRowId: string | null = null;

    async function setupRealtime() {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      await fetchVisitsByIpdId(); // Fetch fresh

      // Get PK id of this row (if it exists)
      const ipdNum = Number(ipdId);
      const { data } = await supabase
        .from("manage_doctor_visits")
        .select("id")
        .eq("ipd_id", ipdNum)
        .is("deleted_data", null)
        .single();

      if (!data?.id) return;
      lastRowId = data.id;

      // Subscribe to PK of this row
      channelRef.current = supabase
        .channel(`doctor_visits_row_${lastRowId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "manage_doctor_visits",
            filter: `id=eq.${lastRowId}`,
          },
          async () => {
            // Always refetch
            await fetchVisitsByIpdId();
          }
        )
        .subscribe();
    }

    if (ipdId) setupRealtime();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [ipdId, fetchVisitsByIpdId]);

  // If row does not exist yet, poll for it and auto-connect subscription when available
  useEffect(() => {
    let interval: any;
    if (!visitsDataRow && ipdId) {
      interval = setInterval(fetchVisitsByIpdId, 2000);
    }
    if (visitsDataRow && interval) {
      clearInterval(interval);
    }
    return () => interval && clearInterval(interval);
  }, [visitsDataRow, ipdId, fetchVisitsByIpdId]);

  // Add Visit (after success, fetch immediately!)
  const onSubmit: SubmitHandler<DoctorVisitFormInputs> = async (formData) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const { data: ipdData, error: ipdError } = await supabase
        .from("ipd_registration")
        .select("uhid")
        .eq("ipd_id", Number(ipdId))
        .single();
      if (ipdError || !ipdData) {
        toast.error("Could not find patient's UHID. Cannot save doctor visit.");
        return;
      }
      const uhid = ipdData.uhid;
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";
      const newVisitEntry: SingleDoctorVisitEntry = {
        tempId: Date.now().toString(),
        doctorName: formData.doctorName,
        dateTime: formData.dateTime,
      };
      let currentDoctorVisitData: SingleDoctorVisitEntry[] = [];
      let currentEnteredBy: string[] = [];
      let rowIdToUpdate: string | null = null;
      const { data: currentRowData } = await supabase
        .from("manage_doctor_visits")
        .select("id, doctor_visit_Data, entered_by")
        .eq("ipd_id", Number(ipdId))
        .single();
      if (currentRowData) {
        rowIdToUpdate = currentRowData.id;
        currentDoctorVisitData = currentRowData.doctor_visit_Data || [];
        if (Array.isArray(currentRowData.entered_by)) {
          currentEnteredBy = [...currentRowData.entered_by];
        } else if (typeof currentRowData.entered_by === "string" && currentRowData.entered_by) {
          currentEnteredBy = [currentRowData.entered_by];
        }
      }
      currentDoctorVisitData.push(newVisitEntry);
      if (!currentEnteredBy.includes(currentUserEmail)) currentEnteredBy.push(currentUserEmail);
      const updatePayload: Partial<ManageDoctorVisitsRow> = {
        doctor_visit_Data: currentDoctorVisitData,
        entered_by: currentEnteredBy,
      };
      if (rowIdToUpdate) {
        const { error } = await supabase
          .from("manage_doctor_visits")
          .update(updatePayload)
          .eq("id", rowIdToUpdate);
        if (error) {
          toast.error("Error updating doctor visits. Please try again.");
        } else {
          toast.success("Doctor visit added successfully!");
          reset({
            doctorName: "",
            dateTime: getCurrentDateTimeLocal(),
          });
          await fetchVisitsByIpdId(); // <- update UI instantly after add
        }
      } else {
        const newRowPayload: Omit<ManageDoctorVisitsRow, "id" | "created_at" | "deleted_data"> = {
          ipd_id: Number(ipdId),
          uhid: uhid,
          doctor_visit_Data: currentDoctorVisitData,
          entered_by: currentEnteredBy,
        };
        const { error } = await supabase
          .from("manage_doctor_visits")
          .insert(newRowPayload);
        if (error) {
          toast.error("Error inserting new doctor visits row. Please try again.");
        } else {
          toast.success("Doctor visit added successfully!");
          reset({
            doctorName: "",
            dateTime: getCurrentDateTimeLocal(),
          });
          await fetchVisitsByIpdId(); // <- update UI instantly after add
        }
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Visit (after success, fetch immediately!)
  const handleDeleteVisit = useCallback(async (tempIdToDelete: string) => {
    if (!window.confirm("Are you sure you want to delete this doctor visit entry?")) return;
    if (!visitsDataRow) {
      toast.error("No visit data found to delete from.");
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserEmail = user?.email || "unknown";
      const updatedDoctorVisitData = visitsDataRow.doctor_visit_Data.map(visit => {
        if (visit.tempId === tempIdToDelete) {
          return {
            ...visit,
            deletedBy: currentUserEmail,
            deletedAt: new Date().toISOString(),
          };
        }
        return visit;
      });
      const { error } = await supabase
        .from("manage_doctor_visits")
        .update({ doctor_visit_Data: updatedDoctorVisitData })
        .eq("id", visitsDataRow.id);
      if (error) {
        toast.error("Failed to delete doctor visit entry. Please try again.");
      } else {
        toast.success("Doctor visit entry marked as deleted!");
        await fetchVisitsByIpdId(); // <- update UI instantly after delete
      }
    } catch (error: any) {
      toast.error("An unexpected error occurred during deletion.");
    }
  }, [visitsDataRow, fetchVisitsByIpdId]);

  // --- Group visits ---
  const displayVisits = useMemo(() => {
    if (!visitsDataRow || !visitsDataRow.doctor_visit_Data) return [];
    return visitsDataRow.doctor_visit_Data
      .filter(visit => !visit.deletedBy)
      .sort((a, b) => new Date(a.dateTime).getTime() - new Date(b.dateTime).getTime());
  }, [visitsDataRow]);
  const groupedVisits = useMemo(() => {
    return displayVisits.reduce((acc: Record<string, SingleDoctorVisitEntry[]>, visit) => {
      const day = format(new Date(visit.dateTime), "dd MMM yyyy");
      if (!acc[day]) acc[day] = [];
      acc[day].push(visit);
      return acc;
    }, {});
  }, [displayVisits]);

  // --- UI ---
  return (
    <div className="space-y-6">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Stethoscope className="h-6 w-6 text-blue-600" />
            Add Doctor Visit
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="doctorName" className="block text-sm font-medium text-slate-700 mb-1">
                Doctor Name
              </label>
              <Input
                id="doctorName"
                type="text"
                {...register("doctorName", { required: true })}
                placeholder="Enter doctor name"
                className="w-full"
              />
            </div>
            <div>
              <label htmlFor="dateTime" className="block text-sm font-medium text-slate-700 mb-1">
                Date &amp; Time
              </label>
              <Input
                id="dateTime"
                type="datetime-local"
                {...register("dateTime", { required: true })}
                className="w-full"
              />
            </div>
            <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Adding...
                </>
              ) : (
                <>
                  <UserCheck className="h-4 w-4 mr-2" /> Add Visit
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Stethoscope className="h-6 w-6 text-green-600" />
          All Doctor Visits
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600"></div>
            <p className="ml-4 text-lg text-gray-600">Loading doctor visits...</p>
          </div>
        ) : displayVisits.length === 0 ? (
          <div className="text-center py-8 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Stethoscope className="h-16 w-16 text-slate-300 mx-auto mb-6" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">No doctor visits recorded yet.</h3>
            <p className="text-slate-500">Add a new visit using the form above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedVisits).sort((a,b) => new Date(a).getTime() - new Date(b).getTime()).map((day) => (
              <Card key={day} className="border border-green-100 shadow-sm">
                <CardHeader className="bg-green-50 py-3 px-4 rounded-t-lg">
                  <CardTitle className="text-lg font-semibold text-green-800 flex items-center gap-2">
                    <Clock className="h-5 w-5" /> {day}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {groupedVisits[day].map((visit) => (
                      <div key={visit.tempId} className="bg-white p-2 rounded-lg border border-slate-100 shadow-xs flex flex-col justify-between text-sm">
                        <div>
                          <p className="font-semibold text-slate-900">{visit.doctorName}</p>
                          <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {format(new Date(visit.dateTime), "hh:mm a")}
                          </p>
                        </div>
                        {visitsDataRow?.entered_by && visitsDataRow.entered_by.length > 0 && (
                          <p className="text-xs text-slate-500 mt-1">
                            Added By: {visitsDataRow.entered_by.join(", ")}
                          </p>
                        )}
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDeleteVisit(visit.tempId)}
                          className="mt-2 self-end px-2 py-1 text-xs"
                        >
                          <Trash2 className="h-3 w-3 mr-1" /> Delete
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
