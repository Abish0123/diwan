import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { 
  Utensils, 
  Calendar, 
  Clock, 
  Plus, 
  Search,
  MoreVertical,
  Edit,
  Trash2,
  CheckCircle2,
  Download,
  Filter,
  Star,
  Users,
  Coffee,
  Sun,
  Moon,
  ChefHat,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { smartDb } from "@/lib/localDb";

interface MenuItem {
  id: string;
  day: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  status: string;
  calories: string;
}

const initialMenu: MenuItem[] = [
  {
    id: "M-001",
    day: "Monday",
    breakfast: "Oatmeal & Fruit",
    lunch: "Grilled Chicken & Rice",
    dinner: "Vegetable Soup & Bread",
    status: "Active",
    calories: "2,100 kcal"
  },
  {
    id: "M-002",
    day: "Tuesday",
    breakfast: "Pancakes & Syrup",
    lunch: "Beef Stew & Potatoes",
    dinner: "Pasta Carbonara",
    status: "Active",
    calories: "2,350 kcal"
  },
  {
    id: "M-003",
    day: "Wednesday",
    breakfast: "Scrambled Eggs & Toast",
    lunch: "Fish & Chips",
    dinner: "Stir-fry Vegetables",
    status: "Active",
    calories: "1,980 kcal"
  },
  {
    id: "M-004",
    day: "Thursday",
    breakfast: "Yogurt & Granola",
    lunch: "Turkey Sandwich & Salad",
    dinner: "Lentil Curry & Naan",
    status: "Active",
    calories: "2,050 kcal"
  },
  {
    id: "M-005",
    day: "Friday",
    breakfast: "French Toast",
    lunch: "Vegetable Lasagna",
    dinner: "Grilled Salmon",
    status: "Active",
    calories: "2,200 kcal"
  }
];

const Mess = () => {
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState(false);
  const [editingMenuItem, setEditingMenuItem] = useState<MenuItem | null>(null);
  const [filterDay, setFilterDay] = useState<string>("all");

  const [formData, setFormData] = useState<MenuItem>({
    id: "",
    day: "Monday",
    breakfast: "",
    lunch: "",
    dinner: "",
    status: "Active",
    calories: ""
  });

  useEffect(() => {
    fetchMenu();
  }, []);

  const fetchMenu = async () => {
    try {
      setIsLoading(true);
      let data = await smartDb.getAll("MessMenu");
      
      // Seed initial data if empty
      if (data.length === 0) {
        for (const item of initialMenu) {
          try {
            await smartDb.create("MessMenu", item as unknown as Record<string, unknown>, item.id);
          } catch (e) {
            // Ignore unique constraint errors during seeding
            console.warn(`Seeding item ${item.id} skipped or failed:`, e);
          }
        }
        data = await smartDb.getAll("MessMenu");
      }
      
      setMenu(data);
    } catch (error) {
      console.error("Error fetching menu:", error);
      toast.error("Failed to load menu");
    } finally {
      setIsLoading(false);
    }
  };

  const activeMenuDays = menu.filter(item => item.status === "Active").length;

  const filteredMenu = menu.filter(item => {
    const matchesSearch = 
      (item.day?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (item.breakfast?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (item.lunch?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (item.dinner?.toLowerCase() || "").includes((searchQuery || "").toLowerCase());
    
    const matchesFilter = filterDay === "all" || item.day === filterDay;
    
    return matchesSearch && matchesFilter;
  });

  const handleExport = () => {
    if (menu.length === 0) {
      toast.error("No menu data to export");
      return;
    }
    
    const headers = ["Day", "Breakfast", "Lunch", "Dinner", "Calories"];
    const csvContent = [
      headers.join(","),
      ...menu.map(item => [
        item.day,
        `"${item.breakfast}"`,
        `"${item.lunch}"`,
        `"${item.dinner}"`,
        item.calories
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `mess_menu_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Menu exported successfully");
  };

  const handlePrint = () => {
    window.print();
  };

  const handleUpdateMenu = () => {
    setEditingMenuItem(null);
    setFormData({
      id: `M-${Math.floor(100 + Math.random() * 900)}`,
      day: "Saturday",
      breakfast: "",
      lunch: "",
      dinner: "",
      status: "Active",
      calories: "2,000 kcal"
    });
    setIsDialogOpen(true);
  };

  const handleEditMenu = (item: MenuItem) => {
    setEditingMenuItem(item);
    setFormData({ ...item });
    setIsDialogOpen(true);
  };

  const handleDeleteMenu = async (id: string) => {
    try {
      await smartDb.delete("MessMenu", id);
      setMenu(menu.filter(m => m.id !== id));
      toast.success("Menu item deleted successfully");
    } catch (error) {
      console.error("Error deleting menu item:", error);
      toast.error("Failed to delete menu item");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMenuItem) {
        await smartDb.update("MessMenu", editingMenuItem.id, formData as unknown as Record<string, unknown>);
        setMenu(menu.map(m => m.id === editingMenuItem.id ? formData : m));
        toast.success("Menu updated successfully");
      } else {
        await smartDb.create("MessMenu", formData as unknown as Record<string, unknown>, formData.id);
        setMenu([...menu, formData]);
        toast.success("Menu item added successfully");
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving menu item:", error);
      toast.error("Failed to save menu item");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              size="icon" 
              className="h-10 w-10 rounded-xl border-slate-200 shrink-0"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-11 h-11 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Utensils className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Mess & Food Management</h1>
              <p className="text-sm text-slate-400">Manage hostel meal plans, menus, and food inventory.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-10 border-slate-200" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export Menu
            </Button>
            <Button className="gradient-primary shadow-lg shadow-purple-200 h-10" onClick={handleUpdateMenu}>
              <Plus className="mr-2 h-4 w-4" /> Update Menu
            </Button>
          </div>
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-purple-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                    <Users className="h-6 w-6" />
                  </div>
                  <Badge className="bg-purple-50 text-purple-600 border-none font-bold">Full Board</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Active Menu Days</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{activeMenuDays}</span>
                  <span className="text-xs text-slate-400 font-medium">of {menu.length} Days</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-blue-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-blue-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform">
                    <Utensils className="h-6 w-6" />
                  </div>
                  <Badge className="bg-blue-50 text-purple-600 border-none font-bold">Not Tracked</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Meals Served</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">—</span>
                  <span className="text-xs text-slate-400 font-medium">No data source yet</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-emerald-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                    <Star className="h-6 w-6" />
                  </div>
                  <Badge className="bg-slate-100 text-slate-500 border-none font-bold">Not Tracked</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Food Rating</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">—</span>
                  <span className="text-xs text-slate-400 font-medium">No feedback data yet</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-white overflow-hidden group">
            <CardContent className="p-0">
              <div className="h-1.5 w-full bg-amber-500" />
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                    <ChefHat className="h-6 w-6" />
                  </div>
                  <Badge className="bg-slate-100 text-slate-500 border-none font-bold">Not Tracked</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Kitchen Staff</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">—</span>
                  <span className="text-xs text-slate-400 font-medium">No staff records yet</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-bold text-slate-900">Weekly Menu Plan</h2>
                <Badge className="bg-slate-100 text-slate-600 border-none px-3 py-1 rounded-lg font-bold flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" /> Current Week: Mar 24 - Mar 30
                </Badge>
              </div>
              <div className="flex items-center gap-3">
                <Select value={filterDay} onValueChange={setFilterDay}>
                  <SelectTrigger className="h-10 border-slate-200 rounded-xl w-[140px]">
                    <Filter className="mr-2 h-4 w-4 text-slate-500" />
                    <SelectValue placeholder="Filter Day" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Days</SelectItem>
                    <SelectItem value="Monday">Monday</SelectItem>
                    <SelectItem value="Tuesday">Tuesday</SelectItem>
                    <SelectItem value="Wednesday">Wednesday</SelectItem>
                    <SelectItem value="Thursday">Thursday</SelectItem>
                    <SelectItem value="Friday">Friday</SelectItem>
                    <SelectItem value="Saturday">Saturday</SelectItem>
                    <SelectItem value="Sunday">Sunday</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Search menu items..." 
                    className="pl-10 h-10 bg-slate-50 border-none focus-visible:ring-purple-500 rounded-xl" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground font-medium">Loading weekly menu...</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="font-bold text-slate-700 h-12 w-[150px]">Day</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">
                      <div className="flex items-center gap-2">
                        <Coffee className="h-4 w-4 text-amber-500" /> Breakfast
                      </div>
                    </TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">
                      <div className="flex items-center gap-2">
                        <Sun className="h-4 w-4 text-blue-500" /> Lunch
                      </div>
                    </TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">
                      <div className="flex items-center gap-2">
                        <Moon className="h-4 w-4 text-purple-500" /> Dinner
                      </div>
                    </TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Calories</TableHead>
                    <TableHead className="text-right font-bold text-slate-700 h-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMenu.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Utensils className="h-8 w-8 text-slate-200" />
                          <p className="text-slate-500 font-medium">No menu items found matching your search.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMenu.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50 border-slate-100 group">
                        <TableCell className="font-bold text-slate-900 text-lg">
                          {item.day}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <Clock className="h-3 w-3" /> 07:30 AM
                            </div>
                            <p className="font-bold text-slate-700">{item.breakfast}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <Clock className="h-3 w-3" /> 12:30 PM
                            </div>
                            <p className="font-bold text-slate-700">{item.lunch}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              <Clock className="h-3 w-3" /> 07:30 PM
                            </div>
                            <p className="font-bold text-slate-700">{item.dinner}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-slate-100 text-slate-600 border-none font-bold">
                            {item.calories}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-slate-100" onClick={() => handleEditMenu(item)}>
                              <Edit className="h-4 w-4 text-slate-400" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-slate-100 text-destructive hover:text-destructive" onClick={() => handleDeleteMenu(item.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="p-8 bg-slate-50/50 border-t border-slate-100">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-2xl bg-white shadow-sm flex items-center justify-center text-purple-600">
                  <ChefHat className="h-6 w-6" />
                </div>
                <div>
                  <p className="font-bold text-slate-900">Head Chef: Not assigned</p>
                  <p className="text-xs text-slate-500 font-medium">Kitchen Shift: 06:00 AM - 09:00 PM</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="h-11 px-6 border-slate-200 rounded-xl font-bold" onClick={() => setIsInventoryOpen(true)}>
                  View Inventory (Preview)
                </Button>
                <Button className="gradient-primary h-11 px-6 rounded-xl font-bold shadow-lg shadow-purple-200" onClick={handlePrint}>
                  Print Menu Card
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Inventory Dialog */}
      <Dialog open={isInventoryOpen} onOpenChange={setIsInventoryOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Kitchen Inventory (Preview)</DialogTitle>
            <DialogDescription>
              Illustrative stock levels for essential kitchen supplies. This preview is not yet connected to a live inventory system.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { item: "Rice", qty: "450 kg", status: "In Stock" },
                  { item: "Wheat Flour", qty: "200 kg", status: "In Stock" },
                  { item: "Cooking Oil", qty: "45 Liters", status: "Low Stock" },
                  { item: "Potatoes", qty: "80 kg", status: "In Stock" },
                  { item: "Onions", qty: "15 kg", status: "Critical" },
                  { item: "Lentils (Dal)", qty: "120 kg", status: "In Stock" },
                ].map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.item}</TableCell>
                    <TableCell>{row.qty}</TableCell>
                    <TableCell>
                      <Badge className={cn(
                        "font-bold",
                        row.status === "In Stock" ? "bg-emerald-50 text-emerald-600" : 
                        row.status === "Low Stock" ? "bg-amber-50 text-amber-600" : 
                        "bg-destructive/10 text-destructive"
                      )}>
                        {row.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInventoryOpen(false)}>Close</Button>
            <Button className="gradient-primary" onClick={() => toast.info("Ordering supplies is a preview feature — not yet wired to a live inventory system")}>Order Supplies (Preview)</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Menu Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingMenuItem ? "Edit Menu Item" : "Add Menu Item"}</DialogTitle>
            <DialogDescription>
              {editingMenuItem ? "Update the meal plan for this day." : "Add a new meal plan for a day."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="day">Day of the Week</Label>
              <Select 
                value={formData.day} 
                onValueChange={(value) => setFormData({...formData, day: value})}
              >
                <SelectTrigger id="day">
                  <SelectValue placeholder="Select Day" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Monday">Monday</SelectItem>
                  <SelectItem value="Tuesday">Tuesday</SelectItem>
                  <SelectItem value="Wednesday">Wednesday</SelectItem>
                  <SelectItem value="Thursday">Thursday</SelectItem>
                  <SelectItem value="Friday">Friday</SelectItem>
                  <SelectItem value="Saturday">Saturday</SelectItem>
                  <SelectItem value="Sunday">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="breakfast">Breakfast</Label>
              <Input 
                id="breakfast" 
                value={formData.breakfast} 
                onChange={(e) => setFormData({...formData, breakfast: e.target.value})}
                placeholder="e.g. Oatmeal & Fruit"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="lunch">Lunch</Label>
              <Input 
                id="lunch" 
                value={formData.lunch} 
                onChange={(e) => setFormData({...formData, lunch: e.target.value})}
                placeholder="e.g. Grilled Chicken & Rice"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dinner">Dinner</Label>
              <Input 
                id="dinner" 
                value={formData.dinner} 
                onChange={(e) => setFormData({...formData, dinner: e.target.value})}
                placeholder="e.g. Vegetable Soup & Bread"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="calories">Calories (kcal)</Label>
              <Input 
                id="calories" 
                value={formData.calories} 
                onChange={(e) => setFormData({...formData, calories: e.target.value})}
                placeholder="e.g. 2,100 kcal"
                required
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-primary">{editingMenuItem ? "Update Menu" : "Add Menu Item"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Mess;
