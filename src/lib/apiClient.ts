// MySQL API Client - All data saves to cPanel MySQL via Express backend
const API_BASE_URL = 'http://localhost:5000/api';

interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  message?: string;
  id?: number | string;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  // ── Generic Methods ──
  private async request<T>(
    method: string,
    endpoint: string,
    data?: any
  ): Promise<T> {
    try {
      const url = `${this.baseUrl}${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error(`API Error [${method} ${endpoint}]:`, error.message);
      throw error;
    }
  }

  // ── Students API ──
  async getStudents(): Promise<any[]> {
    return this.request('GET', '/students');
  }

  async getStudent(id: string): Promise<any> {
    return this.request('GET', `/students/${id}`);
  }

  async createStudent(data: any): Promise<any> {
    return this.request('POST', '/students', data);
  }

  async updateStudent(id: string, data: any): Promise<any> {
    return this.request('PUT', `/students/${id}`, data);
  }

  async deleteStudent(id: string): Promise<any> {
    return this.request('DELETE', `/students/${id}`);
  }

  // ── Admissions API ──
  async getLeads(): Promise<any[]> {
    return this.request('GET', '/admissions');
  }

  async createLead(data: any): Promise<any> {
    return this.request('POST', '/admissions', data);
  }

  async updateLead(id: string, data: any): Promise<any> {
    return this.request('PUT', `/admissions/${id}`, data);
  }

  async enrollLead(id: string): Promise<any> {
    return this.request('POST', `/admissions/${id}/enroll`);
  }

  // ── Attendance API ──
  async getAttendance(): Promise<any[]> {
    return this.request('GET', '/attendance');
  }

  async createAttendance(data: any): Promise<any> {
    return this.request('POST', '/attendance', data);
  }

  // ── Health Records API ──
  async getHealthRecords(): Promise<any[]> {
    return this.request('GET', '/health');
  }

  async createHealthRecord(data: any): Promise<any> {
    return this.request('POST', '/health', data);
  }

  // ── Behavior Incidents API ──
  async getIncidents(): Promise<any[]> {
    return this.request('GET', '/incidents');
  }

  async createIncident(data: any): Promise<any> {
    return this.request('POST', '/incidents', data);
  }

  // ── Exit Records API ──
  async getExitRecords(): Promise<any[]> {
    return this.request('GET', '/exit-records');
  }

  async createExitRecord(data: any): Promise<any> {
    return this.request('POST', '/exit-records', data);
  }
}

// Export singleton instance
export const apiClient = new ApiClient();
