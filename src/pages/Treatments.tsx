import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Edit, Trash2, ChevronDown, ChevronRight, FileDown, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Treatments() {
  const [isTreatmentDialogOpen, setIsTreatmentDialogOpen] = useState(false);
  const [isSubTreatmentDialogOpen, setIsSubTreatmentDialogOpen] = useState(false);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState("");
  const [selectedSubTreatmentId, setSelectedSubTreatmentId] = useState("");
  const [expandedSubTreatments, setExpandedSubTreatments] = useState<string[]>([]);
  const [importingFile, setImportingFile] = useState(false);
  const [editingSubTreatmentId, setEditingSubTreatmentId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);

  const exportToExcel = () => {
    if (!treatments || treatments.length === 0) return;

    // تحضير البيانات للتصدير
    const data = [];

    for (const treatment of treatments) {
      if (treatment.sub_treatments && treatment.sub_treatments.length > 0) {
        for (const subTreatment of treatment.sub_treatments) {
          data.push({
            'العلاج': treatment.name,
            'وصف العلاج': treatment.description || '-',
            'العلاج الفرعي': subTreatment.name,
            'التكلفة التقديرية': subTreatment.estimated_cost || '-',
            'عدد الخطوات': subTreatment.sub_treatment_steps?.length || 0,
            'نسبة الإكمال': `${calculateSubTreatmentProgress(subTreatment.sub_treatment_steps)}%`
          });
        }
      } else {
        data.push({
          'العلاج': treatment.name,
          'وصف العلاج': treatment.description || '-',
          'العلاج الفرعي': '-',
          'التكلفة التقديرية': '-',
          'عدد الخطوات': 0,
          'نسبة الإكمال': '0%'
        });
      }
    }

    // إنشاء ورقة عمل
    const worksheet = XLSX.utils.json_to_sheet(data, {
      header: ['العلاج', 'وصف العلاج', 'العلاج الفرعي', 'التكلفة التقديرية', 'عدد الخطوات', 'نسبة الإكمال']
    });

    // تعديل اتجاه النص للغة العربية
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cell = worksheet[XLSX.utils.encode_cell({ r: R, c: C })];
        if (!cell) continue;
        cell.s = { alignment: { horizontal: 'right', vertical: 'center' } };
      }
    }

    // إنشاء مصنف عمل
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'العلاجات');

    // تحويل المصنف إلى ملف
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const fileData = new Blob([excelBuffer], { type: 'application/octet-stream' });

    // حفظ الملف
    saveAs(fileData, `قائمة_العلاجات_${new Date().toLocaleDateString()}.xlsx`);

    toast({
      title: "تم التصدير بنجاح",
      description: "تم تصدير قائمة العلاجات إلى ملف إكسل",
    });
  };

  const importFromExcel = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportingFile(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // تخطي الصف الأول (العناوين)
        const rows = jsonData.slice(1) as any[][];
        const validTreatments = [];
        
        for (const row of rows) {
          if (!row[0]) continue; // تأكد من وجود اسم العلاج
          
          const treatmentData = {
            name: row[0]?.toString() || '',
            description: row[1]?.toString() === '-' ? '' : row[1]?.toString() || '',
          };
          
          if (treatmentData.name) {
            validTreatments.push(treatmentData);
          }
        }
        
        if (validTreatments.length === 0) {
          toast({
            title: "خطأ في الاستيراد",
            description: "لا توجد بيانات صالحة في الملف",
            variant: "destructive",
          });
          setImportingFile(false);
          return;
        }
        
        // إدراج البيانات في قاعدة البيانات
        const { data: insertedData, error } = await supabase
          .from("treatments")
          .insert(validTreatments)
          .select();
          
        if (error) {
          toast({
            title: "خطأ في الاستيراد",
            description: "فشل في حفظ البيانات في قاعدة البيانات",
            variant: "destructive",
          });
        } else {
          queryClient.invalidateQueries({ queryKey: ["treatments"] });
          toast({
            title: "نجح الاستيراد",
            description: `تم استيراد ${validTreatments.length} علاج بنجاح`,
          });
        }
      } catch (error) {
        toast({
          title: "خطأ في قراءة الملف",
          description: "تأكد من أن الملف بتنسيق إكسل صحيح",
          variant: "destructive",
        });
      } finally {
        setImportingFile(false);
        event.target.value = ''; // إعادة تعيين قيمة المدخل
      }
    };
    
    reader.readAsArrayBuffer(file);
  };

  const [newTreatment, setNewTreatment] = useState({
    name: "",
    description: "",
  });

  const [newSubTreatment, setNewSubTreatment] = useState({
    name: "",
    estimated_cost: "",
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
            estimated_cost,
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
        .insert([treatment])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsTreatmentDialogOpen(false);
      setNewTreatment({ name: "", description: "" });
      toast({ title: "نجح", description: "تم إنشاء العلاج بنجاح" });
    },
  });

  const createSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatment: typeof newSubTreatment) => {
      const { data, error } = await supabase
        .from("sub_treatments")
        .insert([{
          ...subTreatment,
          treatment_id: selectedTreatmentId,
          estimated_cost: parseFloat(subTreatment.estimated_cost)
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsSubTreatmentDialogOpen(false);
      setNewSubTreatment({ name: "", estimated_cost: "" });
      toast({ title: "نجح", description: "تم إضافة العلاج الفرعي بنجاح" });
    },
  });

  const updateSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatment: typeof newSubTreatment & { id: string }) => {
      const { data, error } = await supabase
        .from("sub_treatments")
        .update({
          name: subTreatment.name,
          estimated_cost: parseFloat(subTreatment.estimated_cost)
        })
        .eq("id", subTreatment.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsSubTreatmentDialogOpen(false);
      setEditingSubTreatmentId(null);
      setNewSubTreatment({ name: "", estimated_cost: "" });
      toast({ title: "نجح", description: "تم تحديث العلاج الفرعي بنجاح" });
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

  const updateStepMutation = useMutation({
    mutationFn: async (step: typeof newStep & { id: string }) => {
      const { data, error } = await supabase
        .from("sub_treatment_steps")
        .update({
          step_name: step.step_name,
          step_description: step.step_description,
          step_order: parseInt(step.step_order),
          completion_percentage: parseFloat(step.completion_percentage)
        })
        .eq("id", step.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsStepDialogOpen(false);
      setEditingStepId(null);
      setNewStep({ step_name: "", step_description: "", step_order: "1", completion_percentage: "0" });
      toast({ title: "نجح", description: "تم تحديث الخطوة بنجاح" });
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
    if (editingSubTreatmentId) {
      updateSubTreatmentMutation.mutate({ ...newSubTreatment, id: editingSubTreatmentId });
    } else {
      createSubTreatmentMutation.mutate(newSubTreatment);
    }
  };

  const handleSubmitStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingStepId) {
      updateStepMutation.mutate({ ...newStep, id: editingStepId });
    } else {
      createStepMutation.mutate(newStep);
    }
  };

  const toggleSubTreatmentExpansion = (subTreatmentId: string) => {
    setExpandedSubTreatments(prev =>
      prev.includes(subTreatmentId)
        ? prev.filter(id => id !== subTreatmentId)
        : [...prev, subTreatmentId]
    );
  };

  const calculateSubTreatmentProgress = (steps: any[] | null) => {
    if (!steps || !Array.isArray(steps) || steps.length === 0) return 0;
    const totalPercentage = steps.reduce((sum, step) => sum + (step.completion_percentage || 0), 0);
    return Math.round(totalPercentage);
  };

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl lg:text-3xl font-bold">العلاجات</h1>
        <Dialog open={isTreatmentDialogOpen} onOpenChange={setIsTreatmentDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
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
              <Button type="submit" disabled={createTreatmentMutation.isPending}>
                {createTreatmentMutation.isPending ? "جاري الإضافة..." : "إضافة علاج"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>العلاجات والعلاجات الفرعية</CardTitle>
          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <div className="relative">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={importFromExcel}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={importingFile}
              />
              <Button 
                variant="outline" 
                size="sm"
                disabled={importingFile}
                className="w-full sm:w-auto"
              >
                <Upload className="ml-2 h-4 w-4" />
                {importingFile ? "جاري الاستيراد..." : "استيراد من إكسل"}
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={!treatments || treatments.length === 0}
              className="w-full sm:w-auto"
            >
              <FileDown className="ml-2 h-4 w-4" />
              تصدير إلى إكسل
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري تحميل العلاجات...</div>
          ) : (
            <div className="space-y-6">
              {treatments?.map((treatment) => (
                <div key={treatment.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{treatment.name}</h3>
                      <p className="text-muted-foreground">{treatment.description}</p>
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
                                  <div>
                                    <span className="font-medium">{subTreatment.name}</span>
                                    {subTreatment.estimated_cost && (
                                      <p className="text-sm font-bold text-primary">{Math.round(subTreatment.estimated_cost).toLocaleString('en-US')}</p>
                                    )}
                                  </div>
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
                                       setEditingStepId(null);
                                       setNewStep({ step_name: "", step_description: "", step_order: "1", completion_percentage: "0" });
                                       setIsStepDialogOpen(true);
                                     }}
                                   >
                                     <Plus className="h-3 w-3 mr-1" />
                                     إضافة خطوة
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setEditingSubTreatmentId(subTreatment.id);
                                       setNewSubTreatment({
                                         name: subTreatment.name,
                                         estimated_cost: subTreatment.estimated_cost?.toString() || ""
                                       });
                                       setIsSubTreatmentDialogOpen(true);
                                     }}
                                   >
                                     <Edit className="h-3 w-3" />
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
                                  {subTreatment.sub_treatment_steps && Array.isArray(subTreatment.sub_treatment_steps) && subTreatment.sub_treatment_steps.length > 0 ? (
                                    <div className="space-y-2">
                                      {subTreatment.sub_treatment_steps
                                        .sort((a: any, b: any) => a.step_order - b.step_order)
                                        .map((step: any, index: number) => (
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
                                                 variant="outline"
                                                 size="sm"
                                                 onClick={() => {
                                                   setEditingStepId(step.id);
                                                   setNewStep({
                                                     step_name: step.step_name,
                                                     step_description: step.step_description || "",
                                                     step_order: step.step_order.toString(),
                                                     completion_percentage: (step.completion_percentage || 0).toString()
                                                   });
                                                   setIsStepDialogOpen(true);
                                                 }}
                                               >
                                                 <Edit className="h-3 w-3" />
                                               </Button>
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

      <Dialog open={isSubTreatmentDialogOpen} onOpenChange={(open) => {
        setIsSubTreatmentDialogOpen(open);
        if (!open) {
          setEditingSubTreatmentId(null);
          setNewSubTreatment({ name: "", estimated_cost: "" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSubTreatmentId ? "تعديل علاج فرعي" : "إضافة علاج فرعي"}</DialogTitle>
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
            <div>
              <Label htmlFor="sub_estimated_cost">التكلفة المقدرة ($)</Label>
              <Input
                id="sub_estimated_cost"
                type="number"
                step="0.01"
                value={newSubTreatment.estimated_cost}
                onChange={(e) => setNewSubTreatment({ ...newSubTreatment, estimated_cost: e.target.value })}
                required
              />
            </div>
            <Button type="submit" disabled={createSubTreatmentMutation.isPending || updateSubTreatmentMutation.isPending}>
              {(createSubTreatmentMutation.isPending || updateSubTreatmentMutation.isPending) 
                ? "جاري الحفظ..." 
                : editingSubTreatmentId 
                  ? "حفظ التعديلات" 
                  : "إضافة علاج فرعي"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isStepDialogOpen} onOpenChange={(open) => {
        setIsStepDialogOpen(open);
        if (!open) {
          setEditingStepId(null);
          setNewStep({ step_name: "", step_description: "", step_order: "1", completion_percentage: "0" });
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStepId ? "تعديل خطوة" : "إضافة خطوة جديدة"}</DialogTitle>
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
            <Button type="submit" disabled={createStepMutation.isPending || updateStepMutation.isPending}>
              {(createStepMutation.isPending || updateStepMutation.isPending)
                ? "جاري الحفظ..." 
                : editingStepId 
                  ? "حفظ التعديلات" 
                  : "إضافة خطوة"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}