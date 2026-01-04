import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";import { Plus, Edit, Trash2, ChevronDown, ChevronRight, FileDown, Upload, ChevronsUpDown, Settings2, FolderUp, FolderDown } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { format } from "date-fns";

export default function Treatments() {
  const [isTreatmentDialogOpen, setIsTreatmentDialogOpen] = useState(false);
  const [isSubTreatmentDialogOpen, setIsSubTreatmentDialogOpen] = useState(false);
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState("");
  const [selectedSubTreatmentId, setSelectedSubTreatmentId] = useState("");
  const [expandedSubTreatments, setExpandedSubTreatments] = useState<string[]>([]);
  const [expandedTreatments, setExpandedTreatments] = useState<string[]>([]);
  const [importingFile, setImportingFile] = useState(false);
  const [editingSubTreatmentId, setEditingSubTreatmentId] = useState<string | null>(null);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null);

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
            'التكلفة بالليرة': subTreatment.estimated_cost_syp || 0,
            'التكلفة بالدولار': subTreatment.estimated_cost_usd || 0,
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
    saveAs(fileData, `قائمة_العلاجات_${format(new Date(), 'dd-MM-yyyy')}.xlsx`);

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
    estimated_cost_syp: "",
    estimated_cost_usd: "",
    tooth_association: "not_related" as "not_related" | "single_tooth" | "multiple_teeth",
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
            estimated_cost_syp,
            estimated_cost_usd,
            tooth_association,
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

  const updateTreatmentMutation = useMutation({
    mutationFn: async (treatment: typeof newTreatment & { id: string }) => {
      const { data, error } = await supabase
        .from("treatments")
        .update({
          name: treatment.name,
          description: treatment.description,
        })
        .eq("id", treatment.id)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsTreatmentDialogOpen(false);
      setEditingTreatmentId(null);
      setNewTreatment({ name: "", description: "" });
      toast({ title: "نجح", description: "تم تحديث العلاج بنجاح" });
    },
  });

  const createSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatment: typeof newSubTreatment) => {
      const { data, error } = await supabase
        .from("sub_treatments")
        .insert([{
          name: subTreatment.name,
          treatment_id: selectedTreatmentId,
          estimated_cost_syp: parseInt(subTreatment.estimated_cost_syp) || 0,
          estimated_cost_usd: parseFloat(subTreatment.estimated_cost_usd) || 0,
          tooth_association: subTreatment.tooth_association
        }])
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["treatments"] });
      setIsSubTreatmentDialogOpen(false);
      setNewSubTreatment({ name: "", estimated_cost_syp: "", estimated_cost_usd: "", tooth_association: "not_related" });
      toast({ title: "نجح", description: "تم إضافة العلاج الفرعي بنجاح" });
    },
  });

  const updateSubTreatmentMutation = useMutation({
    mutationFn: async (subTreatment: typeof newSubTreatment & { id: string }) => {
      const { data, error } = await supabase
        .from("sub_treatments")
        .update({
          name: subTreatment.name,
          estimated_cost_syp: parseInt(subTreatment.estimated_cost_syp) || 0,
          estimated_cost_usd: parseFloat(subTreatment.estimated_cost_usd) || 0,
          tooth_association: subTreatment.tooth_association
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
      setNewSubTreatment({ name: "", estimated_cost_syp: "", estimated_cost_usd: "", tooth_association: "not_related" });
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
    if (editingTreatmentId) {
      updateTreatmentMutation.mutate({ ...newTreatment, id: editingTreatmentId });
    } else {
      createTreatmentMutation.mutate(newTreatment);
    }
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

  const toggleTreatmentExpansion = (treatmentId: string) => {
    setExpandedTreatments(prev =>
      prev.includes(treatmentId)
        ? prev.filter(id => id !== treatmentId)
        : [...prev, treatmentId]
    );
  };

  const toggleAllTreatments = () => {
    if (treatments) {
      const allExpanded = expandedTreatments.length === treatments.length;
      if (allExpanded) {
        setExpandedTreatments([]);
      } else {
        setExpandedTreatments(treatments.map(t => t.id));
      }
    }
  };

  const allTreatmentsExpanded = treatments && expandedTreatments.length === treatments.length;

  return (
    <div className="space-y-4 lg:space-y-6">
      

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle>إدارة العلاجات</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Dialog open={isTreatmentDialogOpen} onOpenChange={(open) => {
                setIsTreatmentDialogOpen(open);
                if (!open) {
                  setEditingTreatmentId(null);
                  setNewTreatment({ name: "", description: "" });
                }
              }}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingTreatmentId(null);
                    setNewTreatment({ name: "", description: "" });
                  }}>
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة علاج
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editingTreatmentId ? "تعديل العلاج" : "إضافة علاج جديد"}</DialogTitle>
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
                    <Button type="submit" disabled={createTreatmentMutation.isPending || updateTreatmentMutation.isPending}>
                      {(createTreatmentMutation.isPending || updateTreatmentMutation.isPending) 
                        ? (editingTreatmentId ? "جاري التحديث..." : "جاري الإضافة...") 
                        : (editingTreatmentId ? "تحديث العلاج" : "إضافة علاج")}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllTreatments}
            >
              {allTreatmentsExpanded ? (
                <>
                  <FolderUp className="ml-2 h-4 w-4" />
                  طي الكل
                </>
              ) : (
                <>
                  <FolderDown className="ml-2 h-4 w-4" />
                  توسيع الكل
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => document.getElementById('excel-import-treatments')?.click()}
              disabled={importingFile}
            >
              <Upload className="ml-2 h-4 w-4" />
              {importingFile ? "جاري الاستيراد..." : "استيراد"}
            </Button>
            <input
              id="excel-import-treatments"
              type="file"
              accept=".xlsx,.xls"
              onChange={importFromExcel}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={exportToExcel}
              disabled={!treatments || treatments.length === 0}
            >
              <FileDown className="ml-2 h-4 w-4" />
              تصدير
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">جاري تحميل العلاجات...</div>
          ) : (
            <div className="space-y-4">
              {treatments?.map((treatment) => {
                const isTreatmentExpanded = expandedTreatments.includes(treatment.id);
                return (
                <div key={treatment.id} className="border rounded-lg p-4">
                  <div 
                    className="flex justify-between items-center cursor-pointer"
                    onClick={() => toggleTreatmentExpansion(treatment.id)}
                  >
                    <div className="flex items-center gap-3">
                      <ChevronsUpDown className={`h-5 w-5 text-muted-foreground transition-transform ${isTreatmentExpanded ? 'rotate-180' : ''}`} />
                      <div className="flex-grow">
                        <h3 className="text-lg font-semibold">{treatment.name}</h3>
                        <p className="text-muted-foreground text-sm">{treatment.description}</p>
                        {!isTreatmentExpanded && treatment.sub_treatments && (
                          <p className="text-xs text-muted-foreground">{treatment.sub_treatments.length} علاج فرعي</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTreatmentId(treatment.id);
                          setIsSubTreatmentDialogOpen(true);
                        }}
                        title="إضافة علاج فرعي"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingTreatmentId(treatment.id);
                          setNewTreatment({ name: treatment.name, description: treatment.description || "" });
                          setIsTreatmentDialogOpen(true);
                        }}
                        title="تعديل العلاج"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTreatmentMutation.mutate(treatment.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="حذف العلاج"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {isTreatmentExpanded && treatment.sub_treatments && treatment.sub_treatments.length > 0 && (
                    <div className="pt-4 mt-4 border-t">
                      <h4 className="font-medium mb-2">العلاجات الفرعية:</h4>
                      <div className="space-y-3">
                        {treatment.sub_treatments.map((subTreatment) => {
                          const isExpanded = expandedSubTreatments.includes(subTreatment.id);
                          const progress = calculateSubTreatmentProgress(subTreatment.sub_treatment_steps);

                          return (
                            <div key={subTreatment.id} className="border rounded p-3 bg-muted/50">
                              <div 
                                className="flex justify-between items-center cursor-pointer"
                                onClick={() => toggleSubTreatmentExpansion(subTreatment.id)}
                              >
                                <div className="flex items-center gap-3">
                                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  <div>
                                    <span className="font-medium">{subTreatment.name}</span>
                                    {(subTreatment.estimated_cost_syp || subTreatment.estimated_cost_usd) && (
                                      <p className="text-sm font-bold text-primary">
                                        {subTreatment.estimated_cost_syp ? `${Math.round(subTreatment.estimated_cost_syp).toLocaleString('en-US')} ل.س` : ''}
                                        {subTreatment.estimated_cost_syp && subTreatment.estimated_cost_usd ? ' / ' : ''}
                                        {subTreatment.estimated_cost_usd ? `$${subTreatment.estimated_cost_usd}` : ''}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Progress value={progress} className="w-24 h-2" />
                                    <span className="text-sm text-muted-foreground">{progress}%</span>
                                  </div>
                                </div>
                                 <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                   <Button
                                     variant="outline"
                                     size="icon"
                                     onClick={() => {
                                       setSelectedSubTreatmentId(subTreatment.id);
                                       setEditingStepId(null);
                                       setNewStep({ step_name: "", step_description: "", step_order: "1", completion_percentage: "0" });
                                       setIsStepDialogOpen(true);
                                     }}
                                   >
                                     <Plus className="h-4 w-4" />
                                   </Button>
                                     <Button
                                       variant="outline"
                                       size="icon"
                                       onClick={() => {
                                          setSelectedTreatmentId(treatment.id);
                                          setEditingSubTreatmentId(subTreatment.id);
                                          setNewSubTreatment({
                                            name: subTreatment.name,
                                            estimated_cost_syp: Math.round(subTreatment.estimated_cost_syp || 0).toString(),
                                            estimated_cost_usd: (subTreatment.estimated_cost_usd || 0).toString(),
                                            tooth_association: (subTreatment as any).tooth_association || "not_related"
                                          });
                                          setIsSubTreatmentDialogOpen(true);
                                        }}
                                     >
                                       <Settings2 className="h-4 w-4" />
                                     </Button>
                                   <Button
                                     variant="ghost"
                                     size="icon"
                                     onClick={() => deleteSubTreatmentMutation.mutate(subTreatment.id)}
                                     className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                   >
                                     <Trash2 className="h-4 w-4" />
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
                                             <div className="flex items-center gap-2">
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
                                                 className="w-20 h-8 text-center"
                                               />
                                               <span className="text-sm">%</span>
                                               <Button
                                                 variant="outline"
                                                 size="icon"
                                                 onClick={() => {
                                                   setEditingStepId(step.id);
                                                   setNewStep({
                                                     step_name: step.step_name,
                                                     step_description: step.step_description || "",
                                                     step_order: step.step_order.toString(),
                                                     completion_percentage: (step.completion_percentage || 0).toString()
                                                   });
                                                   setSelectedSubTreatmentId(subTreatment.id);
                                                   setIsStepDialogOpen(true);
                                                 }}
                                               >
                                                 <Edit className="h-4 w-4" />
                                               </Button>
                                               <Button
                                                 variant="ghost"
                                                 size="icon"
                                                 onClick={() => deleteStepMutation.mutate(step.id)}
                                                 className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                               >
                                                 <Trash2 className="h-4 w-4" />
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isSubTreatmentDialogOpen} onOpenChange={(open) => {
        setIsSubTreatmentDialogOpen(open);
        if (!open) {
          setEditingSubTreatmentId(null);
          setNewSubTreatment({ name: "", estimated_cost_syp: "", estimated_cost_usd: "", tooth_association: "not_related" });
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
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sub_estimated_cost_syp">التكلفة المقدرة (ل.س)</Label>
                <Input
                  id="sub_estimated_cost_syp"
                  type="text"
                  value={newSubTreatment.estimated_cost_syp ? Math.round(Number(newSubTreatment.estimated_cost_syp)).toLocaleString('en-US') : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    if (value === '' || /^\d+$/.test(value)) {
                      setNewSubTreatment({ ...newSubTreatment, estimated_cost_syp: value });
                    }
                  }}
                />
              </div>
              <div>
                <Label htmlFor="sub_estimated_cost_usd">التكلفة المقدرة ($)</Label>
                <Input
                  id="sub_estimated_cost_usd"
                  type="text"
                  value={newSubTreatment.estimated_cost_usd}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^\d.]/g, '');
                    setNewSubTreatment({ ...newSubTreatment, estimated_cost_usd: value });
                  }}
                />
              </div>
            </div>
            <div>
              <Label>الارتباط بالأسنان</Label>
              <RadioGroup 
                value={newSubTreatment.tooth_association} 
                onValueChange={(value) => setNewSubTreatment({ 
                  ...newSubTreatment, 
                  tooth_association: value as "not_related" | "single_tooth" | "multiple_teeth" 
                })}
                className="flex flex-col space-y-2 mt-2"
              >
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="not_related" id="not_related" />
                  <Label htmlFor="not_related" className="cursor-pointer font-normal">غير مرتبط بأسنان</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="single_tooth" id="single_tooth" />
                  <Label htmlFor="single_tooth" className="cursor-pointer font-normal">مرتبط بسن واحد</Label>
                </div>
                <div className="flex items-center space-x-2 space-x-reverse">
                  <RadioGroupItem value="multiple_teeth" id="multiple_teeth" />
                  <Label htmlFor="multiple_teeth" className="cursor-pointer font-normal">مرتبط بعدة أسنان</Label>
                </div>
              </RadioGroup>
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