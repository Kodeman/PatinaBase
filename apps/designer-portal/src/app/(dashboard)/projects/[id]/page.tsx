'use client';

import { use } from 'react';
import { Card } from '@patina/design-system';
import { Button } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@patina/design-system';
import { Input } from '@patina/design-system';
import { Textarea } from '@patina/design-system';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@patina/design-system';
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  Users,
  CheckCircle2,
  Circle,
  Clock,
  Plus,
  FileText,
  Paperclip,
  Edit,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { id } = use(params);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [showRFIDialog, setShowRFIDialog] = useState(false);

  // Mock data - replace with real API call
  const project = {
    id,
    name: 'Modern Living Room Redesign',
    clientName: 'Sarah Johnson',
    status: 'active',
    budget: 7500000,
    spent: 4800000,
    startDate: '2024-01-15',
    endDate: '2024-03-30',
    progress: 65,
    description: 'Complete redesign of main living space with modern minimalist aesthetic.',
  };

  const tasks = [
    { id: '1', title: 'Select paint colors', status: 'completed', assignee: 'Me', dueDate: '2024-01-20' },
    { id: '2', title: 'Order furniture', status: 'completed', assignee: 'Me', dueDate: '2024-01-25' },
    { id: '3', title: 'Install lighting fixtures', status: 'in-progress', assignee: 'Contractor', dueDate: '2024-02-10' },
    { id: '4', title: 'Paint walls', status: 'pending', assignee: 'Contractor', dueDate: '2024-02-15' },
    { id: '5', title: 'Deliver furniture', status: 'pending', assignee: 'Vendor', dueDate: '2024-02-20' },
  ];

  const rfis = [
    {
      id: '1',
      title: 'Clarify outlet placement',
      status: 'open',
      createdAt: '2024-02-01',
      responses: 2,
    },
    {
      id: '2',
      title: 'Confirm paint finish',
      status: 'resolved',
      createdAt: '2024-01-28',
      responses: 5,
    },
  ];

  const timeline = [
    { id: '1', type: 'task', title: 'Task "Select paint colors" completed', date: '2024-01-20' },
    { id: '2', type: 'rfi', title: 'RFI "Confirm paint finish" created', date: '2024-01-28' },
    { id: '3', type: 'task', title: 'Task "Order furniture" completed', date: '2024-01-25' },
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return { icon: CheckCircle2, color: 'text-green-600', bgColor: 'bg-green-100 dark:bg-green-900' };
      case 'in-progress':
        return { icon: Clock, color: 'text-blue-600', bgColor: 'bg-blue-100 dark:bg-blue-900' };
      default:
        return { icon: Circle, color: 'text-gray-600', bgColor: 'bg-gray-100 dark:bg-gray-700' };
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/projects">
          <Button variant="ghost" size="sm" className="mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {project.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              Client: {project.clientName}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit Project
            </Button>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Timeline</p>
              <p className="text-lg font-bold">
                {formatDate(project.startDate)} - {formatDate(project.endDate)}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Budget</p>
              <p className="text-lg font-bold">{formatCurrency(project.budget)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Spent</p>
              <p className="text-lg font-bold">{formatCurrency(project.spent)}</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Progress</p>
              <p className="text-lg font-bold">{project.progress}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Progress Bar */}
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">Overall Progress</h2>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {tasks.filter((t) => t.status === 'completed').length}/{tasks.length} tasks completed
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
          <div
            className="bg-purple-600 h-3 rounded-full transition-all"
            style={{ width: `${project.progress}%` }}
          />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="tasks" className="w-full">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="rfis">RFIs</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Tasks</h2>
              <Button onClick={() => setShowTaskDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Task
              </Button>
            </div>

            <div className="space-y-3">
              {tasks.map((task) => {
                const statusConfig = getStatusConfig(task.status);
                const StatusIcon = statusConfig.icon;

                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-4 p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <div className={`p-2 ${statusConfig.bgColor} rounded-lg`}>
                      <StatusIcon className={`h-5 w-5 ${statusConfig.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium">{task.title}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {task.assignee}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {formatDate(task.dueDate)}
                        </span>
                      </div>
                    </div>
                    <Badge
                      variant="solid"
                      color={
                        task.status === 'completed'
                          ? 'success'
                          : task.status === 'in-progress'
                          ? 'primary'
                          : 'neutral'
                      }
                    >
                      {task.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="rfis" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Requests for Information</h2>
              <Button onClick={() => setShowRFIDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New RFI
              </Button>
            </div>

            <div className="space-y-3">
              {rfis.map((rfi) => (
                <div
                  key={rfi.id}
                  className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{rfi.title}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Created {formatDate(rfi.createdAt)} • {rfi.responses} responses
                      </p>
                    </div>
                    <Badge variant="solid" color={rfi.status === 'resolved' ? 'success' : 'primary'}>
                      {rfi.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Project Documents</h2>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
            <div className="text-center py-12 text-gray-500">
              <Paperclip className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No documents uploaded yet</p>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-6">Activity Timeline</h2>
            <div className="space-y-4">
              {timeline.map((event) => (
                <div key={event.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 bg-purple-600 rounded-full" />
                    <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700" />
                  </div>
                  <div className="pb-8">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {formatDate(event.date)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">Project Details</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Description</p>
                <p className="text-gray-900 dark:text-gray-100">{project.description}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Status</p>
                <Badge variant="solid">{project.status}</Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Client</p>
                <Link href={`/clients/${project.id}`} className="text-purple-600 hover:underline">
                  {project.clientName}
                </Link>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Task Title</label>
                <Input placeholder="e.g., Order materials" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Assignee</label>
                <Input placeholder="Who will complete this task?" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Due Date</label>
                <Input type="date" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Textarea rows={3} placeholder="Task details..." />
              </div>
            </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowTaskDialog(false)}>Create Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add RFI Dialog */}
      <Dialog open={showRFIDialog} onOpenChange={setShowRFIDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New RFI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Subject</label>
                <Input placeholder="What information do you need?" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <Textarea rows={4} placeholder="Provide details about your question..." />
              </div>
            </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRFIDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setShowRFIDialog(false)}>Submit RFI</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
