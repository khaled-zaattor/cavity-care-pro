import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Edit, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export default function Treatments() {
  const [isTreatmentDialogOpen, setIsTreatmentDialogOpen] = useState(false);
  const [isSubTreatmentDialogOpen, setIsSubTreatmentDialogOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState("");
  
  const [newTreatment, setNewTreatment] = useState({
    name: "",
    description: "",
    estimated_cost: "",
  });

  const [newSubTreatment, setNewSubTreatment] = useState({
    name: "",
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: treatments, isLoading } = useQuery({
    queryKey: ["treatments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select(`
          *,
          sub_treatments (id, name)
        `)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const createTreatmentMutation = useMutation({
    mutationFn: async (treatment: typeof newTreatment) => {
      const { data, error } = await supabase
        .from("treatments")
        .insert([{ ...treatment, estimated_cost: parseFloat(treatment.estimated_cost) }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsTreatmentDialogOpen(false);
      setNewTreatment({ name: "", description: "", estimated_cost: "" });
      toast({ title: "Success", description: "Treatment created successfully" });
    },
  });

  const createSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatment: typeof newSubTreatment) => {
      const { data, error } = await supabase
        .from("sub_treatments")
        .insert([{ ...subTreatment, treatment_id: selectedTreatmentId }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsSubTreatmentDialogOpen(false);
      setNewSubTreatment({ name: "" });
      toast({ title: "Success", description: "Sub-treatment added successfully" });
    },
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: async (treatmentId: string) => {
      const { error } = await supabase.from("treatments").delete().eq("id", treatmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "Success", description: "Treatment deleted successfully" });
    },
  });

  const deleteSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatmentId: string) => {
      const { error } = await supabase.from("sub_treatments").delete().eq("id", subTreatmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "Success", description: "Sub-treatment deleted successfully" });
    },
  });

  const handleSubmitTreatment = (e: React.FormEvent) => {
    e.preventDefault();
    createTreatmentMutation.mutate(newTreatment);
  };

  const handleSubmitSubTreatment = (e: React.FormEvent) => {
    e.preventDefault();
    createSubTreatmentMutation.mutate(newSubTreatment);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Treatments</h1>
        <Dialog open={isTreatmentDialogOpen} onOpenChange={setIsTreatmentDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Treatment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Treatment</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitTreatment} className="space-y-4">
              <div>
                <Label htmlFor="name">Treatment Name</Label>
                <Input
                  id="name"
                  value={newTreatment.name}
                  onChange={(e) => setNewTreatment({ ...newTreatment, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newTreatment.description}
                  onChange={(e) => setNewTreatment({ ...newTreatment, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="estimated_cost">Estimated Cost ($)</Label>
                <Input
                  id="estimated_cost"
                  type="number"
                  step="0.01"
                  value={newTreatment.estimated_cost}
                  onChange={(e) => setNewTreatment({ ...newTreatment, estimated_cost: e.target.value })}
                  required
                />
              </div>
              <Button type="submit" disabled={createTreatmentMutation.isPending}>
                {createTreatmentMutation.isPending ? "Adding..." : "Add Treatment"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Treatments & Sub-Treatments</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading treatments...</div>
          ) : (
            <div className="space-y-6">
              {treatments?.map((treatment) => (
                <div key={treatment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{treatment.name}</h3>
                      <p className="text-muted-foreground">{treatment.description}</p>
                      <p className="text-lg font-bold text-primary">${treatment.estimated_cost}</p>
                    </div>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTreatmentId(treatment.id);
                          setIsSubTreatmentDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add Sub-Treatment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteTreatmentMutation.mutate(treatment.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {treatment.sub_treatments && treatment.sub_treatments.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-2">Sub-Treatments:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                        {treatment.sub_treatments.map((subTreatment) => (
                          <div key={subTreatment.id} className="flex justify-between items-center bg-muted p-2 rounded">
                            <span className="text-sm">{subTreatment.name}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteSubTreatmentMutation.mutate(subTreatment.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSubTreatmentDialogOpen} onOpenChange={setIsSubTreatmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Sub-Treatment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitSubTreatment} className="space-y-4">
            <div>
              <Label htmlFor="sub_name">Sub-Treatment Name</Label>
              <Input
                id="sub_name"
                value={newSubTreatment.name}
                onChange={(e) => setNewSubTreatment({ ...newSubTreatment, name: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={createSubTreatmentMutation.isPending}>
              {createSubTreatmentMutation.isPending ? "Adding..." : "Add Sub-Treatment"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}