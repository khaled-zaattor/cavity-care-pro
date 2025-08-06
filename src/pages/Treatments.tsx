import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function Treatments() {
  const [isTreatmentDialogOpen, setIsTreatmentDialogOpen] = useState(false);
  const [isSubTreatmentDialogOpen, setIsSubTreatmentDialogOpen] = useState(false);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState("");
  const [selectedSubTreatmentId, setSelectedSubTreatmentId] = useState("");
  const [expandedSubTreatments, setExpandedSubTreatments] = useState<string[]>([]);
  
  const [newTreatment, setNewTreatment] = useState({
    name: "",
    description: "",
    estimated_cost: "",
  });

  const [newSubTreatment, setNewSubTreatment] = useState({
    name: "",
  });

  const [newStep, setNewStep] = useState({
    step_name: "",
    step_description: "",
    step_order: "1",
    completion_percentage: "0",
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
          sub_treatments (
            id, 
            name,
            sub_treatment_steps (
              id,
              step_name,
              step_description,
              step_order,
              completion_percentage
            )
          )
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
      toast({ title: "نجح", description: "تم إنشاء العلاج بنجاح" });
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
      toast({ title: "نجح", description: "تم إضافة العلاج الفرعي بنجاح" });
    },
  });

  const createStepMutation = useMutation({
    mutationFn: async (step: typeof newStep) => {
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .insert([{ 
          ...step, 
          sub_treatment_id: selectedSubTreatmentId,
          step_order: parseInt(step.step_order),
          completion_percentage: parseFloat(step.completion_percentage)
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsStepDialogOpen(false);
      setNewStep({ step_name: "", step_description: "", step_order: "1", completion_percentage: "0" });
      toast({ title: "نجح", description: "تم إضافة الخطوة بنجاح" });
    },
  });

  const updateStepPercentageMutation = useMutation({
    mutationFn: async ({ stepId, percentage }: { stepId: string; percentage: number }) => {
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .update({ completion_percentage: percentage })
        .eq("id", stepId)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "نجح", description: "تم تحديث نسبة الإنجاز" });
    },
  });

  const deleteTreatmentMutation = useMutation({
    mutationFn: async (treatmentId: string) => {
      const { error } = await supabase.from("treatments").delete().eq("id", treatmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "نجح", description: "تم حذف العلاج بنجاح" });
    },
  });

  const deleteSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatmentId: string) => {
      const { error } = await supabase.from("sub_treatments").delete().eq("id", subTreatmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "نجح", description: "تم حذف العلاج الفرعي بنجاح" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await supabase.from("sub_treatment_steps").delete().eq("id", stepId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      toast({ title: "نجح", description: "تم حذف الخطوة بنجاح" });
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

  const handleSubmitStep = (e: React.FormEvent) => {
    e.preventDefault();
    createStepMutation.mutate(newStep);
  };

  const toggleSubTreatmentExpansion = (subTreatmentId: string) => {
    setExpandedSubTreatments(prev => 
      prev.includes(subTreatmentId)
        ? prev.filter(id => id !== subTreatmentId)
        : [...prev, subTreatmentId]
    );
  };

  const calculateSubTreatmentProgress = (steps: any[]) => {
    if (!steps || steps.length === 0) return 0;
    const totalPercentage = steps.reduce((sum, step) => sum + (step.completion_percentage || 0), 0);
    return Math.round(totalPercentage / steps.length);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">العلاجات</h1>
        <Dialog open={isTreatmentDialogOpen} onOpenChange={setIsTreatmentDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              إضافة علاج
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة علاج جديد</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmitTreatment} className="space-y-4">
              <div>
                <Label htmlFor="name">اسم العلاج</Label>
                <Input
                  id="name"
                  value={newTreatment.name}
                  onChange={(e) => setNewTreatment({ ...newTreatment, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">الوصف</Label>
                <Textarea
                  id="description"
                  value={newTreatment.description}
                  onChange={(e) => setNewTreatment({ ...newTreatment, description: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="estimated_cost">التكلفة المقدرة ($)</Label>
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
                {createTreatmentMutation.isPending ? "جاري الإضافة..." : "إضافة علاج"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>العلاجات والعلاجات الفرعية</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>جاري تحميل العلاجات...</div>
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
                        إضافة علاج فرعي
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
                      <h4 className="font-medium mb-2">العلاجات الفرعية:</h4>
                      <div className="space-y-3">
                        {treatment.sub_treatments.map((subTreatment) => {
                          const isExpanded = expandedSubTreatments.includes(subTreatment.id);
                          const progress = calculateSubTreatmentProgress(subTreatment.sub_treatment_steps);
                          
                          return (
                            <div key={subTreatment.id} className="border rounded p-3 bg-muted/50">
                              <div className="flex justify-between items-center">
                                <div className="flex items-center space-x-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => toggleSubTreatmentExpansion(subTreatment.id)}
                                  >
                                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                  <span className="font-medium">{subTreatment.name}</span>
                                  <div className="flex items-center space-x-2">
                                    <Progress value={progress} className="w-20" />
                                    <span className="text-sm text-muted-foreground">{progress}%</span>
                                  </div>
                                </div>
                                <div className="flex space-x-1">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedSubTreatmentId(subTreatment.id);
                                      setIsStepDialogOpen(true);
                                    }}
                                  >
                                    <Plus className="h-3 w-3 mr-1" />
                                    إضافة خطوة
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteSubTreatmentMutation.mutate(subTreatment.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                              
                              <Collapsible open={isExpanded}>
                                <CollapsibleContent className="mt-3">
                                  {subTreatment.sub_treatment_steps && subTreatment.sub_treatment_steps.length > 0 ? (
                                    <div className="space-y-2">
                                      {subTreatment.sub_treatment_steps
                                        .sort((a, b) => a.step_order - b.step_order)
                                        .map((step, index) => (
                                        <div key={step.id} className="flex items-center justify-between bg-background p-2 rounded border">
                                          <div className="flex-1">
                                            <div className="flex items-center space-x-2">
                                              <span className="text-sm font-medium">
                                                {index + 1}. {step.step_name}
                                              </span>
                                            </div>
                                            {step.step_description && (
                                              <p className="text-xs text-muted-foreground mt-1">
                                                {step.step_description}
                                              </p>
                                            )}
                                          </div>
                                          <div className="flex items-center space-x-2">
                                            <Input
                                              type="number"
                                              min="0"
                                              max="100"
                                              value={step.completion_percentage || 0}
                                              onChange={(e) => {
                                                const percentage = parseFloat(e.target.value) || 0;
                                                if (percentage >= 0 && percentage <= 100) {
                                                  updateStepPercentageMutation.mutate({
                                                    stepId: step.id,
                                                    percentage
                                                  });
                                                }
                                              }}
                                              className="w-16 text-center"
                                            />
                                            <span className="text-sm">%</span>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              onClick={() => deleteStepMutation.mutate(step.id)}
                                            >
                                              <Trash2 className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">لا توجد خطوات لهذا العلاج الفرعي</p>
                                  )}
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          );
                        })}
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
            <DialogTitle>إضافة علاج فرعي</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitSubTreatment} className="space-y-4">
            <div>
              <Label htmlFor="sub_name">اسم العلاج الفرعي</Label>
              <Input
                id="sub_name"
                value={newSubTreatment.name}
                onChange={(e) => setNewSubTreatment({ ...newSubTreatment, name: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={createSubTreatmentMutation.isPending}>
              {createSubTreatmentMutation.isPending ? "جاري الإضافة..." : "إضافة علاج فرعي"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة خطوة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitStep} className="space-y-4">
            <div>
              <Label htmlFor="step_name">اسم الخطوة</Label>
              <Input
                id="step_name"
                value={newStep.step_name}
                onChange={(e) => setNewStep({ ...newStep, step_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="step_description">وصف الخطوة</Label>
              <Textarea
                id="step_description"
                value={newStep.step_description}
                onChange={(e) => setNewStep({ ...newStep, step_description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="step_order">ترتيب الخطوة</Label>
              <Input
                id="step_order"
                type="number"
                min="1"
                value={newStep.step_order}
                onChange={(e) => setNewStep({ ...newStep, step_order: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="completion_percentage">نسبة الإنجاز الافتراضية (%)</Label>
              <Input
                id="completion_percentage"
                type="number"
                min="0"
                max="100"
                value={newStep.completion_percentage}
                onChange={(e) => setNewStep({ ...newStep, completion_percentage: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={createStepMutation.isPending}>
              {createStepMutation.isPending ? "جاري الإضافة..." : "إضافة خطوة"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}