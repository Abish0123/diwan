import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Home,
  Users,
  Bed,
  MoreVertical,
  Edit,
  Trash2,
  Filter,
  Download,
  Building2,
  CheckCircle2,
  AlertCircle,
  ArrowUpRight,
  ArrowLeft,
  MapPin,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { smartDb } from "@/lib/localDb";

interface Room {
  id: string;
  block: string;
  type: string;
  capacity: number;
  occupied: number;
  cost: number;
  status: string;
  floor: string;
}

const Rooms = () => {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  
  const [formData, setFormData] = useState<Room>({
    id: "",
    block: "A-Block",
    type: "Single Room",
    capacity: 1,
    occupied: 0,
    cost: 0,
    status: "Available",
    floor: "1st Floor"
  });

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const data = await smartDb.getAll("HostelRoom");
      setRooms(data);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      toast.error("Failed to load rooms");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRooms = rooms.filter(room => {
    const matchesSearch =
      (room.id?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (room.block?.toLowerCase() || "").includes((searchQuery || "").toLowerCase()) ||
      (room.type?.toLowerCase() || "").includes((searchQuery || "").toLowerCase());

    const matchesType =
      filterType === "all" ||
      (() => {
        const t = filterType.toLowerCase();
        const rt = (room.type?.toLowerCase() || "");
        if (t === "single") return rt.includes("single");
        if (t === "double") return rt.includes("double");
        if (t === "dormitory") return rt.includes("dormitory") || rt.includes("triple") || rt.includes("quad");
        return true;
      })();

    const matchesStatus =
      filterStatus === "all" ||
      (() => {
        const s = filterStatus.toLowerCase();
        const rs = (room.status?.toLowerCase() || "");
        if (s === "available") return rs === "available";
        if (s === "occupied") return rs === "full" || rs === "occupied";
        if (s === "maintenance") return rs === "maintenance";
        return true;
      })();

    return matchesSearch && matchesType && matchesStatus;
  });

  const handleAddRoom = () => {
    setEditingRoom(null);
    setFormData({
      id: `RM-${Math.floor(100 + Math.random() * 900)}`,
      block: "A-Block",
      type: "Single Room",
      capacity: 1,
      occupied: 0,
      cost: 1000,
      status: "Available",
      floor: "1st Floor"
    });
    setIsDialogOpen(true);
  };

  const handleEditRoom = (room: Room) => {
    setEditingRoom(room);
    setFormData({ ...room });
    setIsDialogOpen(true);
  };

  const handleDeleteRoom = async (id: string) => {
    try {
      await smartDb.delete("HostelRoom", id);
      setRooms(rooms.filter(r => r.id !== id));
      toast.success("Room deleted successfully");
    } catch (error) {
      console.error("Error deleting room:", error);
      toast.error("Failed to delete room");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRoom) {
        await smartDb.update("HostelRoom", editingRoom.id, formData as unknown as Record<string, unknown>);
        setRooms(rooms.map(r => r.id === editingRoom.id ? formData : r));
        toast.success("Room updated successfully");
      } else {
        if (rooms.find(r => r.id === formData.id)) {
          toast.error("Room ID already exists");
          return;
        }
        await smartDb.create("HostelRoom", formData as unknown as Record<string, unknown>, formData.id);
        setRooms([...rooms, formData]);
        toast.success("Room added successfully");
      }
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving room:", error);
      toast.error("Failed to save room");
    }
  };

  const totalRooms = rooms.length;
  const totalCapacity = rooms.reduce((acc, r) => acc + r.capacity, 0);
  const totalOccupied = rooms.reduce((acc, r) => acc + r.occupied, 0);
  const availableBeds = totalCapacity - totalOccupied;
  const occupancyRate = totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  const handleExport = () => {
    if (rooms.length === 0) {
      toast.error("No room data to export");
      return;
    }

    const headers = ["Room ID", "Block", "Type", "Floor", "Capacity", "Occupied", "Monthly Cost", "Status"];
    const csvContent = [
      headers.join(","),
      ...rooms.map(room => [
        room.id,
        room.block,
        `"${room.type}"`,
        `"${room.floor}"`,
        room.capacity,
        room.occupied,
        room.cost,
        room.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `hostel_rooms_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Rooms exported successfully");
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
              <Building2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Room Inventory</h1>
              <p className="text-sm text-slate-400">Manage hostel rooms, blocks, and real-time availability.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" className="h-10 border-slate-200" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" /> Export
            </Button>
            <Button className="gradient-primary shadow-lg shadow-purple-200 h-10" onClick={handleAddRoom}>
              <Plus className="mr-2 h-4 w-4" /> Add New Room
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
                    <Building2 className="h-6 w-6" />
                  </div>
                  <Badge className="bg-purple-50 text-purple-600 border-none font-bold">{new Set(rooms.map(r => r.block)).size} Blocks</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Rooms</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{totalRooms}</span>
                  <span className="text-xs text-slate-400 font-medium">Across {new Set(rooms.map(r => r.block)).size} Blocks</span>
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
                    <Bed className="h-6 w-6" />
                  </div>
                  <Badge className="bg-blue-50 text-purple-600 border-none font-bold">{totalCapacity} Total</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Total Capacity</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{totalCapacity}</span>
                  <span className="text-xs text-slate-400 font-medium">Beds Available</span>
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
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <Badge className="bg-emerald-50 text-emerald-600 border-none font-bold">{occupancyRate}% Rate</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Occupancy</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{totalOccupied}</span>
                  <span className="text-xs text-slate-400 font-medium">Beds Occupied</span>
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
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <Badge className="bg-amber-50 text-amber-600 border-none font-bold">{availableBeds} Left</Badge>
                </div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Available Beds</h3>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl font-bold text-slate-900">{availableBeds}</span>
                  <span className="text-xs text-slate-400 font-medium">Ready for Allocation</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card className="border-none shadow-sm bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Search by Room ID, Block or Type..." 
                    className="pl-10 h-11 bg-slate-50 border-none focus-visible:ring-purple-500 rounded-xl" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="h-11 px-5 border-slate-200 rounded-xl">
                      <Filter className="mr-2 h-4 w-4 text-slate-500" /> Filters
                      {(filterType !== "all" || filterStatus !== "all") && (
                        <span className="ml-1 h-2 w-2 rounded-full bg-primary inline-block" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-4 rounded-xl" align="end">
                    <div className="space-y-4">
                      <h4 className="font-bold text-sm">Filter Rooms</h4>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Room Type</Label>
                        <Select value={filterType} onValueChange={setFilterType}>
                          <SelectTrigger className="h-9 rounded-lg text-sm">
                            <SelectValue placeholder="All Types" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="single">Single</SelectItem>
                            <SelectItem value="double">Double</SelectItem>
                            <SelectItem value="dormitory">Dormitory</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</Label>
                        <Select value={filterStatus} onValueChange={setFilterStatus}>
                          <SelectTrigger className="h-9 rounded-lg text-sm">
                            <SelectValue placeholder="All Statuses" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="occupied">Occupied</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {(filterType !== "all" || filterStatus !== "all") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => { setFilterType("all"); setFilterStatus("all"); }}
                        >
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-slate-100 text-slate-600 border-none px-3 py-1.5 rounded-lg font-bold">
                  Total: {totalRooms} Rooms
                </Badge>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground font-medium">Loading room inventory...</p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="hover:bg-transparent border-slate-100">
                    <TableHead className="font-bold text-slate-700 h-12">Room Details</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Location</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Capacity</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Occupancy</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Monthly Cost</TableHead>
                    <TableHead className="font-bold text-slate-700 h-12">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-700 h-12">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRooms.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-32 text-center">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Building2 className="h-8 w-8 text-slate-200" />
                          <p className="text-slate-500 font-medium">
                            {rooms.length === 0
                              ? "No rooms yet. Click \"Add New Room\" to create your first hostel room."
                              : "No rooms found matching your search."}
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRooms.map((room) => (
                      <TableRow key={room.id} className="hover:bg-slate-50/50 border-slate-100 group">
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600 group-hover:bg-purple-100 group-hover:text-purple-600 transition-colors">
                              <Home className="h-6 w-6" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">{room.id}</p>
                              <p className="text-xs text-slate-500 font-medium">{room.type}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-bold text-slate-700">{room.block}</p>
                            <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {room.floor}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-purple-600">
                              <Bed className="h-4 w-4" />
                            </div>
                            <span className="font-bold text-slate-700">{room.capacity} Beds</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2 w-32">
                            <div className="flex justify-between text-xs font-bold">
                              <span className="text-slate-500">{room.occupied}/{room.capacity}</span>
                              <span className={cn(
                                "text-slate-900",
                                room.occupied === room.capacity ? "text-purple-600" : "text-purple-600"
                              )}>
                                {room.capacity > 0 ? Math.round((room.occupied / room.capacity) * 100) : 0}%
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  "h-full transition-all duration-500",
                                  room.occupied === room.capacity ? "bg-purple-500" : "bg-blue-500"
                                )}
                                style={{ width: `${room.capacity > 0 ? (room.occupied / room.capacity) * 100 : 0}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-lg font-bold text-slate-900">${room.cost}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Per Month</p>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            className={cn(
                              "px-3 py-1 rounded-lg font-bold border-none",
                              room.status === "Available" 
                                ? "bg-emerald-50 text-emerald-600" 
                                : "bg-purple-50 text-purple-600"
                            )}
                          >
                            {room.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-100">
                                <MoreVertical className="h-5 w-5 text-slate-400" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48 p-2 rounded-xl border-slate-100 shadow-xl">
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer" onClick={() => handleEditRoom(room)}>
                                <Edit className="mr-3 h-4 w-4 text-slate-400" /> 
                                <span className="font-medium">Edit Details</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer" onClick={() => navigate(`/hostel/allocation?room=${room.id}`)}>
                                <Users className="mr-3 h-4 w-4 text-slate-400" /> 
                                <span className="font-medium">View Occupants</span>
                              </DropdownMenuItem>
                              <div className="h-px bg-slate-100 my-1" />
                              <DropdownMenuItem className="rounded-lg py-2.5 cursor-pointer text-destructive focus:text-destructive" onClick={() => handleDeleteRoom(room.id)}>
                                <Trash2 className="mr-3 h-4 w-4" /> 
                                <span className="font-medium">Delete Room</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="p-6 border-t border-slate-100 bg-slate-50/30">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500 font-medium">Showing {filteredRooms.length} of {totalRooms} rooms</p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="rounded-lg border-slate-200 h-9" disabled>Previous</Button>
                <Button variant="outline" size="sm" className="rounded-lg border-slate-200 h-9" disabled>Next</Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Add/Edit Room Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editingRoom ? "Edit Room" : "Add New Room"}</DialogTitle>
            <DialogDescription>
              {editingRoom ? "Update the details for this hostel room." : "Enter the details for the new hostel room."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id">Room ID</Label>
                <Input 
                  id="id" 
                  value={formData.id} 
                  onChange={(e) => setFormData({...formData, id: e.target.value})}
                  placeholder="RM-101"
                  required
                  disabled={!!editingRoom}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block">Block</Label>
                <Select 
                  value={formData.block} 
                  onValueChange={(value) => setFormData({...formData, block: value})}
                >
                  <SelectTrigger id="block">
                    <SelectValue placeholder="Select Block" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A-Block">A-Block</SelectItem>
                    <SelectItem value="B-Block">B-Block</SelectItem>
                    <SelectItem value="C-Block">C-Block</SelectItem>
                    <SelectItem value="D-Block">D-Block</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">Room Type</Label>
                <Select 
                  value={formData.type} 
                  onValueChange={(value) => setFormData({...formData, type: value})}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Single Room">Single Room</SelectItem>
                    <SelectItem value="Double Sharing">Double Sharing</SelectItem>
                    <SelectItem value="Triple Sharing">Triple Sharing</SelectItem>
                    <SelectItem value="Quad Sharing">Quad Sharing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="floor">Floor</Label>
                <Select 
                  value={formData.floor} 
                  onValueChange={(value) => setFormData({...formData, floor: value})}
                >
                  <SelectTrigger id="floor">
                    <SelectValue placeholder="Select Floor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ground Floor">Ground Floor</SelectItem>
                    <SelectItem value="1st Floor">1st Floor</SelectItem>
                    <SelectItem value="2nd Floor">2nd Floor</SelectItem>
                    <SelectItem value="3rd Floor">3rd Floor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capacity">Capacity (Beds)</Label>
                <Input 
                  id="capacity" 
                  type="number"
                  value={formData.capacity} 
                  onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cost">Monthly Cost ($)</Label>
                <Input 
                  id="cost" 
                  type="number"
                  value={formData.cost} 
                  onChange={(e) => setFormData({...formData, cost: parseInt(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(value) => setFormData({...formData, status: value})}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Available">Available</SelectItem>
                  <SelectItem value="Full">Full</SelectItem>
                  <SelectItem value="Maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" className="gradient-primary">{editingRoom ? "Update Room" : "Add Room"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Rooms;
