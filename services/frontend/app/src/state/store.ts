import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { TypedUseSelectorHook, useDispatch, useSelector } from "react-redux";

type ExamPrefs = {
  order: "asc" | "desc";
  orderBy: string;
  page: number;
  rowsPerPage: number;
  searchQuery: string;
  searchDraft: string;
};

type VenuePrefs = {
  order: "asc" | "desc";
  orderBy: string;
  page: number;
  rowsPerPage: number;
  searchQuery: string;
  searchDraft: string;
};

type StudentPrefs = {
  searchQuery: string;
  searchDraft: string;
  sortOrder: "asc" | "desc";
  sortBy: string;
};

type InvigilatorPrefs = {
  viewMode: "list" | "grid" | "calendar";
  firstLetter: string;
  lastLetter: string;
  searchQuery: string;
  searchDraft: string;
  sortField: "firstName" | "lastName";
  sortOrder: "asc" | "desc";
  page: number;
  showAll: boolean;
};

type CalendarPrefs = {
  viewMode: "grid" | "timeline";
  currentDate: string; // ISO date string
  searchQuery: string;
  page: number;
  searchDraft: string;
};

type AssignInvigilatorInputs = {
  start: string;
  end: string;
  role: string;
};

type AssignInvigilatorDraft = {
  selectedIds: number[];
  search: string;
  onlyAvailable: boolean;
  expandedIds: number[];
  assignmentInputs: Record<number, AssignInvigilatorInputs>;
  error: string | null;
  snackbar: { open: boolean; message: string };
  initialized?: boolean;
};

type VenueDialogDraft = {
  venueName: string;
  capacity: number | "";
  venueType: string;
  isAccessible: boolean;
  provisions: string[];
  initialized?: boolean;
};

type InvigilatorDialogDraft = {
  activeStep: number;
  preferredName: string;
  fullName: string;
  loginUsername: string;
  tempPassword: string;
  showPassword: boolean;
  mobile: string;
  mobileTextOnly: string;
  altPhone: string;
  universityEmail: string;
  personalEmail: string;
  dietContracts: Record<string, string>;
  notes: string;
  qualifications: string[];
  restrictions: string[];
  resigned: boolean;
  availabilityDiets: string[];
  initialized?: boolean;
};

type AnnouncementDialogDraft = {
  title: string;
  body: string;
  audience: "" | "invigilator" | "all";
  imageData: string;
  imageName: string | null;
  publishedAt: string;
  expiresAt: string;
  priority: number | "";
  isActive: boolean;
  error: string | null;
};

type DietManagerDiet = {
  id: number;
  code: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  restriction_cutoff: string | null;
  is_active: boolean;
};

type DietDraft = {
  id?: number;
  code: string;
  name: string;
  start_date: string;
  end_date: string;
  restriction_cutoff: string;
  is_active: boolean;
};

type DietManagerDraft = {
  dialogOpen: boolean;
  draft: DietDraft;
  error: string;
  dietToDelete: DietManagerDiet | null;
  snackbar: { open: boolean; message: string };
};

type UploadFileDraft = {
  uploadType: string;
  selectedFileName: string;
  uploading: boolean;
  snackbar: { type: "success" | "error" | null; message: string };
};

type ExportInvigilatorDialogDraft = {
  onlyConfirmed: boolean;
  includeCancelled: boolean;
  includeProvisions: boolean;
};

type NotifyDialogDraft = {
  subject: string;
  message: string;
  error: string | null;
};

type ExamsPageUi = {
  addOpen: boolean;
  deleteOpen: boolean;
  deleteTargetIds: number[];
  deleteError: string | null;
  selectedIds: number[];
  openRows: Record<number, boolean>;
};

type ExamPageUi = {
  editOpen: boolean;
  successOpen: boolean;
  successMessage: string;
  deleteOpen: boolean;
  deleting: boolean;
  assignOpen: boolean;
  assignVenueId: number | null;
};

type AddExamUi = {
  snackbarOpen: boolean;
};

type VenuesPageUi = {
  addOpen: boolean;
  deleteOpen: boolean;
  deleteTargets: string[];
  deleteError: string | null;
  successOpen: boolean;
  successMessage: string;
  errorMessage: string | null;
  venueTypeOverrides: Record<string, string>;
  updatingVenueIds: Record<string, boolean>;
  selectedIds: string[];
  openRows: Record<string, boolean>;
};

type VenuePageExam = {
  code: string;
  subject: string;
  department?: string;
  mainVenue: string;
  mainStartTime: string;
  mainEndTime: string;
  venues: {
    venue: string;
    startTime: string;
    endTime: string;
    students?: number;
    invigilators?: number;
  }[];
};

type VenuePageUi = {
  editOpen: boolean;
  popupOpen: boolean;
  selectedExam: VenuePageExam | null;
  visibleCount: number;
  successOpen: boolean;
  successMessage: string;
  deleteOpen: boolean;
  deleting: boolean;
};

type StudentsVenueDialogState = {
  studentExamId: number;
  examId: number;
  currentExamVenueId: number | null;
  studentName: string;
  examName: string;
};

type StudentsPageUi = {
  selected: string[];
  openRows: Record<string, boolean>;
  venueDialog: StudentsVenueDialogState | null;
  confirmDialog: { studentExamId: number; studentName: string; examName: string } | null;
  unconfirmDialog: { studentExamId: number; studentName: string; examName: string } | null;
  deleteOpen: boolean;
  deleteTargets: string[];
  deleteError: string | null;
  page: number;
  rowsPerPage: number;
  selectedVenueId: number | null;
  saveError: string | null;
  confirmError: string | null;
  unconfirmError: string | null;
};

type CalendarUi = {
  popupOpen: boolean;
  selectedExam: {
    id: number;
    code: string;
    subject: string;
    department: string;
    mainVenue: string;
    mainStartTime: string;
    mainEndTime: string;
    venues: { venue: string; startTime: string; endTime: string; students?: number; invigilators?: number }[];
  } | null;
};

type InvigilatorProfileUi = {
  availabilityView: "list" | "calendar";
  availabilityLimit: number;
  selectedAvailabilityDate: string;
  selectedAvailabilityDiet: string;
  editDialogOpen: boolean;
  deleteOpen: boolean;
  deleting: boolean;
  successMessage: string;
  successOpen: boolean;
  selectedContractDiet: string;
  promoteOpen: boolean;
  promoteMode: "admin" | "senior";
  promoting: boolean;
  promoteError: string | null;
  demoteOpen: boolean;
  demoting: boolean;
  demoteError: string | null;
  seniorDemoteOpen: boolean;
  seniorDemoting: boolean;
  seniorDemoteError: string | null;
};

type InvigilatorsPageUi = {
  addOpen: boolean;
  successOpen: boolean;
  successMessage: string;
  deleteOpen: boolean;
  deleteError: string | null;
  calendarModalOpen: boolean;
  currentMonthIndex: number;
  bulkAction: string;
  exporting: boolean;
  notifyOpen: boolean;
  exportDialogOpen: boolean;
  selectedIds: number[];
  selectedDate: string | null;
};

type ExamVenueDraft = {
  id: number | string;
  venue_name: string;
  start_time: string;
  exam_length: number | null;
  provision_capabilities: string[];
};

type ExamDialogDraft = {
  name: string;
  code: string;
  examType: string;
  students: number | "";
  school: string;
  contact: string;
  mainVenue: string;
  mainStart: string;
  mainLength: number | "";
  mainProvisions: string[];
  extraVenues: ExamVenueDraft[];
  initialized?: boolean;
};

type ExamDialogState = {
  add: ExamDialogDraft;
  edit: Record<number, ExamDialogDraft>;
};

type DashboardPrefs = {
  selectedSchool: string;
  selectedDiet: string;
  notificationQuery: string;
  selectedNotificationType: string | null;
  selectedInvigilatorId: number | null;
  visibleCount: number;
  announcementDialogOpen: boolean;
  announcementSnackbar: { open: boolean; message: string };
  exportSnackbar: { open: boolean; message: string };
  activeAnnouncementIndex: number;
  exporting: boolean;
  bulkExporting: boolean;
};

type AdminProfileUi = {
  name: string;
  email: string;
  phone: string;
  photoPreview: string | null;
  avatarData: string | null;
  confirmRemoveOpen: boolean;
  showPhotoSave: boolean;
  snackbar: { open: boolean; message: string; severity: "success" | "error" };
  lastUpdated: string;
  lastLogin: string | null;
  deleteAccountOpen: boolean;
  darkMode: boolean;
  notifications: boolean;
  notifyEmail: "instant" | "daily" | "off";
  notifySms: boolean;
  notifyPush: boolean;
  passwords: { current: string; next: string; confirm: string };
  showPasswords: boolean;
  extraSessionsToShow: number;
};

type AdminLayoutUi = {
  accountMenuOpen: boolean;
};

type InvigilatorLayoutUi = {
  accountMenuOpen: boolean;
};

type InvigilatorSelfProfileUi = {
  darkMode: boolean;
  notifyEmail: "instant" | "daily" | "weekly" | "off";
  notifySms: boolean;
  notifyPush: boolean;
  name: string;
  email: string;
  phone: string;
  photoPreview: string | null;
  avatarData: string | null;
  confirmRemoveOpen: boolean;
  showPhotoSave: boolean;
  lastUpdated: string;
  lastLogin: string | null;
  deleteAccountOpen: boolean;
  snackbar: { open: boolean; message: string; severity: "success" | "error" };
  passwords: { current: string; next: string; confirm: string };
  showPasswords: boolean;
  extraSessionsToShow: number;
};

type InvigilatorDashboardUi = {
  visibleCount: number;
  activeAnnouncementIndex: number;
  notificationQuery: string;
  selectedNotificationType: string | null;
};

type InvigilatorTimetableUi = {
  selectedDate: string | null;
  dateInput: string;
  month: string;
  drawerOpen: boolean;
  drawerAssignmentId: number | null;
  cancelNote: string;
  drawerMode: "request" | "undo";
  snackbar: { open: boolean; message: string; severity: "success" | "error" };
};

type InvigilatorRestrictionsUi = {
  selectedDiet: string | null;
  queryDiet: string | null;
  days: any[];
  snackbar: { open: boolean; message: string; severity: "success" | "error" };
};

type InvigilatorShiftsUi = {
  snackbar: { open: boolean; message: string; severity: "success" | "error" };
  dialogShiftId: string | number | null;
};

type AdminTableState = {
  exams: ExamPrefs;
  venues: VenuePrefs;
  students: StudentPrefs;
  invigilators: InvigilatorPrefs;
  calendar: CalendarPrefs;
  examDialogs: ExamDialogState;
  assignInvigilatorDialogs: Record<number, AssignInvigilatorDraft>;
  venueDialogs: {
    add: VenueDialogDraft;
    edit: Record<string, VenueDialogDraft>;
  };
  invigilatorDialogs: {
    add: InvigilatorDialogDraft;
    edit: Record<number, InvigilatorDialogDraft>;
  };
  announcementDialog: AnnouncementDialogDraft;
  dietManager: DietManagerDraft;
  uploadFile: UploadFileDraft;
  exportInvigilatorDialog: ExportInvigilatorDialogDraft;
  notifyDialog: NotifyDialogDraft;
  examsPage: ExamsPageUi;
  examPage: ExamPageUi;
  addExamUi: AddExamUi;
  venuesPage: VenuesPageUi;
  venuePage: VenuePageUi;
  studentsPage: StudentsPageUi;
  calendarUi: CalendarUi;
  invigilatorProfileUi: InvigilatorProfileUi;
  invigilatorsPageUi: InvigilatorsPageUi;
  dashboard: DashboardPrefs;
  adminProfileUi: AdminProfileUi;
  adminLayoutUi: AdminLayoutUi;
  invigilatorLayoutUi: InvigilatorLayoutUi;
  invigilatorSelfProfileUi: InvigilatorSelfProfileUi;
  invigilatorDashboardUi: InvigilatorDashboardUi;
  invigilatorTimetableUi: InvigilatorTimetableUi;
  invigilatorRestrictionsUi: InvigilatorRestrictionsUi;
  invigilatorShiftsUi: InvigilatorShiftsUi;
};

const emptyExamDraft: ExamDialogDraft = {
  name: "",
  code: "",
  examType: "",
  students: "",
  school: "",
  contact: "",
  mainVenue: "",
  mainStart: "",
  mainLength: "",
  mainProvisions: [],
  extraVenues: [],
};

const emptyVenueDraft: VenueDialogDraft = {
  venueName: "",
  capacity: "",
  venueType: "",
  isAccessible: true,
  provisions: [],
};

const emptyInvigilatorDraft: InvigilatorDialogDraft = {
  activeStep: 0,
  preferredName: "",
  fullName: "",
  loginUsername: "",
  tempPassword: "TempPass123!",
  showPassword: false,
  mobile: "",
  mobileTextOnly: "",
  altPhone: "",
  universityEmail: "",
  personalEmail: "",
  dietContracts: {},
  notes: "",
  qualifications: [],
  restrictions: [],
  resigned: false,
  availabilityDiets: [],
};

const emptyAnnouncementDraft: AnnouncementDialogDraft = {
  title: "",
  body: "",
  audience: "",
  imageData: "",
  imageName: null,
  publishedAt: "",
  expiresAt: "",
  priority: "",
  isActive: true,
  error: null,
};

const emptyDietDraft: DietDraft = {
  code: "",
  name: "",
  start_date: "",
  end_date: "",
  restriction_cutoff: "",
  is_active: true,
};

const initialState: AdminTableState = {
  exams: {
    order: "asc",
    orderBy: "code",
    page: 0,
    rowsPerPage: 10,
    searchQuery: "",
    searchDraft: "",
  },
  venues: {
    order: "asc",
    orderBy: "name",
    page: 0,
    rowsPerPage: 10,
    searchQuery: "",
    searchDraft: "",
  },
  students: {
    searchQuery: "",
    searchDraft: "",
    sortOrder: "asc",
    sortBy: "student_name",
  },
  invigilators: {
    viewMode: "grid",
    firstLetter: "All",
    lastLetter: "All",
    searchQuery: "",
    searchDraft: "",
    sortField: "firstName",
    sortOrder: "asc",
    page: 1,
    showAll: false,
  },
  calendar: {
    viewMode: "grid",
    currentDate: "",
    searchQuery: "",
    page: 1,
    searchDraft: "",
  },
  examDialogs: {
    add: { ...emptyExamDraft },
    edit: {},
  },
  assignInvigilatorDialogs: {},
  venueDialogs: {
    add: { ...emptyVenueDraft },
    edit: {},
  },
  invigilatorDialogs: {
    add: { ...emptyInvigilatorDraft },
    edit: {},
  },
  announcementDialog: { ...emptyAnnouncementDraft },
  dietManager: {
    dialogOpen: false,
    draft: { ...emptyDietDraft },
    error: "",
    dietToDelete: null,
    snackbar: { open: false, message: "" },
  },
  uploadFile: {
    uploadType: "",
    selectedFileName: "",
    uploading: false,
    snackbar: { type: null, message: "" },
  },
  exportInvigilatorDialog: {
    onlyConfirmed: false,
    includeCancelled: false,
    includeProvisions: false,
  },
  notifyDialog: {
    subject: "",
    message: "",
    error: null,
  },
  examsPage: {
    addOpen: false,
    deleteOpen: false,
    deleteTargetIds: [],
    deleteError: null,
    selectedIds: [],
    openRows: {},
  },
  examPage: {
    editOpen: false,
    successOpen: false,
    successMessage: "",
    deleteOpen: false,
    deleting: false,
    assignOpen: false,
    assignVenueId: null,
  },
  addExamUi: {
    snackbarOpen: false,
  },
  venuesPage: {
    addOpen: false,
    deleteOpen: false,
    deleteTargets: [],
    deleteError: null,
    successOpen: false,
    successMessage: "",
    errorMessage: null,
    venueTypeOverrides: {},
    updatingVenueIds: {},
    selectedIds: [],
    openRows: {},
  },
  venuePage: {
    editOpen: false,
    popupOpen: false,
    selectedExam: null,
    visibleCount: 4,
    successOpen: false,
    successMessage: "",
    deleteOpen: false,
    deleting: false,
  },
  studentsPage: {
    selected: [],
    openRows: {},
    venueDialog: null,
    confirmDialog: null,
    unconfirmDialog: null,
    deleteOpen: false,
    deleteTargets: [],
    deleteError: null,
    page: 0,
    rowsPerPage: 10,
    selectedVenueId: null,
    saveError: null,
    confirmError: null,
    unconfirmError: null,
  },
  calendarUi: {
    popupOpen: false,
    selectedExam: null,
  },
  invigilatorProfileUi: {
    availabilityView: "list",
    availabilityLimit: 4,
    selectedAvailabilityDate: new Date().toISOString(),
    selectedAvailabilityDiet: "",
    editDialogOpen: false,
    deleteOpen: false,
    deleting: false,
    successMessage: "",
    successOpen: false,
    selectedContractDiet: "",
    promoteOpen: false,
    promoteMode: "admin",
    promoting: false,
    promoteError: null,
    demoteOpen: false,
    demoting: false,
    demoteError: null,
    seniorDemoteOpen: false,
    seniorDemoting: false,
    seniorDemoteError: null,
  },
  invigilatorsPageUi: {
    addOpen: false,
    successOpen: false,
    successMessage: "",
    deleteOpen: false,
    deleteError: null,
    calendarModalOpen: false,
    currentMonthIndex: 0,
    bulkAction: "",
    exporting: false,
    notifyOpen: false,
    exportDialogOpen: false,
    selectedIds: [],
    selectedDate: null,
  },
  dashboard: {
    selectedSchool: "",
    selectedDiet: "",
    notificationQuery: "",
    selectedNotificationType: null,
    selectedInvigilatorId: null,
    visibleCount: 4,
    announcementDialogOpen: false,
    announcementSnackbar: { open: false, message: "" },
    exportSnackbar: { open: false, message: "" },
    activeAnnouncementIndex: 0,
    exporting: false,
    bulkExporting: false,
  },
  adminProfileUi: {
    name: "",
    email: "",
    phone: "",
    photoPreview: null,
    avatarData: null,
    confirmRemoveOpen: false,
    showPhotoSave: false,
    snackbar: { open: false, message: "", severity: "success" },
    lastUpdated: "Just now",
    lastLogin: null,
    deleteAccountOpen: false,
    darkMode: false,
    notifications: true,
    notifyEmail: "instant",
    notifySms: false,
    notifyPush: false,
    passwords: { current: "", next: "", confirm: "" },
    showPasswords: false,
    extraSessionsToShow: 0,
  },
  adminLayoutUi: {
    accountMenuOpen: false,
  },
  invigilatorLayoutUi: {
    accountMenuOpen: false,
  },
  invigilatorSelfProfileUi: {
    darkMode: false,
    notifyEmail: "instant",
    notifySms: false,
    notifyPush: false,
    name: "",
    email: "",
    phone: "",
    photoPreview: null,
    avatarData: null,
    confirmRemoveOpen: false,
    showPhotoSave: false,
    lastUpdated: "Just now",
    lastLogin: null,
    deleteAccountOpen: false,
    snackbar: { open: false, message: "", severity: "success" },
    passwords: { current: "", next: "", confirm: "" },
    showPasswords: false,
    extraSessionsToShow: 0,
  },
  invigilatorDashboardUi: {
    visibleCount: 4,
    activeAnnouncementIndex: 0,
    notificationQuery: "",
    selectedNotificationType: null,
  },
  invigilatorTimetableUi: {
    selectedDate: null,
    dateInput: "",
    month: new Date().toISOString(),
    drawerOpen: false,
    drawerAssignmentId: null,
    cancelNote: "",
    drawerMode: "request",
    snackbar: { open: false, message: "", severity: "success" },
  },
  invigilatorRestrictionsUi: {
    selectedDiet: null,
    queryDiet: null,
    days: [],
    snackbar: { open: false, message: "", severity: "success" },
  },
  invigilatorShiftsUi: {
    snackbar: { open: false, message: "", severity: "success" },
    dialogShiftId: null,
  },
};

const adminTablesSlice = createSlice({
  name: "adminTables",
  initialState,
  reducers: {
    setExamsPrefs(state, action: PayloadAction<Partial<ExamPrefs>>) {
      Object.assign(state.exams, action.payload);
    },
    setVenuesPrefs(state, action: PayloadAction<Partial<VenuePrefs>>) {
      Object.assign(state.venues, action.payload);
    },
    setStudentsPrefs(state, action: PayloadAction<Partial<StudentPrefs>>) {
      Object.assign(state.students, action.payload);
    },
    setInvigilatorsPrefs(state, action: PayloadAction<Partial<InvigilatorPrefs>>) {
      Object.assign(state.invigilators, action.payload);
    },
    setCalendarPrefs(state, action: PayloadAction<Partial<CalendarPrefs>>) {
      Object.assign(state.calendar, action.payload);
    },
    setAssignInvigilatorDraft(
      state,
      action: PayloadAction<{ key: number; draft: Partial<AssignInvigilatorDraft> }>
    ) {
      const { key, draft } = action.payload;
      state.assignInvigilatorDialogs[key] = {
        ...(state.assignInvigilatorDialogs[key] || {
          selectedIds: [],
          search: "",
          onlyAvailable: true,
          expandedIds: [],
          assignmentInputs: {},
          error: null,
          snackbar: { open: false, message: "" },
        }),
        ...draft,
      };
    },
    resetAssignInvigilatorDraft(state, action: PayloadAction<number>) {
      delete state.assignInvigilatorDialogs[action.payload];
    },
    setAddVenueDraft(state, action: PayloadAction<Partial<VenueDialogDraft>>) {
      Object.assign(state.venueDialogs.add, action.payload);
    },
    resetAddVenueDraft(state) {
      state.venueDialogs.add = { ...emptyVenueDraft };
    },
    setEditVenueDraft(
      state,
      action: PayloadAction<{ venueId: string; draft: Partial<VenueDialogDraft> }>
    ) {
      const { venueId, draft } = action.payload;
      state.venueDialogs.edit[venueId] = {
        ...(state.venueDialogs.edit[venueId] || { ...emptyVenueDraft }),
        ...draft,
      };
    },
    resetEditVenueDraft(state, action: PayloadAction<string>) {
      delete state.venueDialogs.edit[action.payload];
    },
    setAddInvigilatorDraft(state, action: PayloadAction<Partial<InvigilatorDialogDraft>>) {
      Object.assign(state.invigilatorDialogs.add, action.payload);
    },
    resetAddInvigilatorDraft(state) {
      state.invigilatorDialogs.add = { ...emptyInvigilatorDraft };
    },
    setEditInvigilatorDraft(
      state,
      action: PayloadAction<{ invigilatorId: number; draft: Partial<InvigilatorDialogDraft> }>
    ) {
      const { invigilatorId, draft } = action.payload;
      state.invigilatorDialogs.edit[invigilatorId] = {
        ...(state.invigilatorDialogs.edit[invigilatorId] || { ...emptyInvigilatorDraft }),
        ...draft,
      };
    },
    resetEditInvigilatorDraft(state, action: PayloadAction<number>) {
      delete state.invigilatorDialogs.edit[action.payload];
    },
    setAnnouncementDraft(state, action: PayloadAction<Partial<AnnouncementDialogDraft>>) {
      Object.assign(state.announcementDialog, action.payload);
    },
    resetAnnouncementDraft(state) {
      state.announcementDialog = { ...emptyAnnouncementDraft };
    },
    setDietManagerDraft(state, action: PayloadAction<Partial<DietManagerDraft>>) {
      Object.assign(state.dietManager, action.payload);
    },
    setUploadFileDraft(state, action: PayloadAction<Partial<UploadFileDraft>>) {
      Object.assign(state.uploadFile, action.payload);
    },
    setExportInvigilatorDialogDraft(state, action: PayloadAction<Partial<ExportInvigilatorDialogDraft>>) {
      Object.assign(state.exportInvigilatorDialog, action.payload);
    },
    resetExportInvigilatorDialogDraft(state) {
      state.exportInvigilatorDialog = {
        onlyConfirmed: false,
        includeCancelled: false,
        includeProvisions: false,
      };
    },
    setNotifyDialogDraft(state, action: PayloadAction<Partial<NotifyDialogDraft>>) {
      Object.assign(state.notifyDialog, action.payload);
    },
    resetNotifyDialogDraft(state) {
      state.notifyDialog = { subject: "", message: "", error: null };
    },
    setExamsPageUi(state, action: PayloadAction<Partial<ExamsPageUi>>) {
      Object.assign(state.examsPage, action.payload);
    },
    resetExamsPageUi(state) {
      state.examsPage = {
        addOpen: false,
        deleteOpen: false,
        deleteTargetIds: [],
        deleteError: null,
        selectedIds: [],
        openRows: {},
      };
    },
    setExamPageUi(state, action: PayloadAction<Partial<ExamPageUi>>) {
      Object.assign(state.examPage, action.payload);
    },
    resetExamPageUi(state) {
      state.examPage = {
        editOpen: false,
        successOpen: false,
        successMessage: "",
        deleteOpen: false,
        deleting: false,
        assignOpen: false,
        assignVenueId: null,
      };
    },
    setAddExamUi(state, action: PayloadAction<Partial<AddExamUi>>) {
      Object.assign(state.addExamUi, action.payload);
    },
    setVenuesPageUi(state, action: PayloadAction<Partial<VenuesPageUi>>) {
      Object.assign(state.venuesPage, action.payload);
    },
    resetVenuesPageUi(state) {
      state.venuesPage = {
        addOpen: false,
        deleteOpen: false,
        deleteTargets: [],
        deleteError: null,
        successOpen: false,
        successMessage: "",
        errorMessage: null,
        venueTypeOverrides: {},
        updatingVenueIds: {},
        selectedIds: [],
        openRows: {},
      };
    },
    setVenuePageUi(state, action: PayloadAction<Partial<VenuePageUi>>) {
      Object.assign(state.venuePage, action.payload);
    },
    resetVenuePageUi(state) {
      state.venuePage = {
        editOpen: false,
        popupOpen: false,
        selectedExam: null,
        visibleCount: 4,
        successOpen: false,
        successMessage: "",
        deleteOpen: false,
        deleting: false,
      };
    },
    setStudentsPageUi(state, action: PayloadAction<Partial<StudentsPageUi>>) {
      Object.assign(state.studentsPage, action.payload);
    },
    resetStudentsPageUi(state) {
      state.studentsPage = {
        selected: [],
        openRows: {},
        venueDialog: null,
        deleteOpen: false,
        deleteTargets: [],
        deleteError: null,
        page: 0,
        rowsPerPage: 10,
        selectedVenueId: null,
        saveError: null,
      };
    },
    setCalendarUi(state, action: PayloadAction<Partial<CalendarUi>>) {
      Object.assign(state.calendarUi, action.payload);
    },
    resetCalendarUi(state) {
      state.calendarUi = { popupOpen: false, selectedExam: null };
    },
    setInvigilatorProfileUi(state, action: PayloadAction<Partial<InvigilatorProfileUi>>) {
      Object.assign(state.invigilatorProfileUi, action.payload);
    },
    resetInvigilatorProfileUi(state) {
      state.invigilatorProfileUi = {
        availabilityView: "list",
        availabilityLimit: 4,
        selectedAvailabilityDate: new Date().toISOString(),
        selectedAvailabilityDiet: "",
        editDialogOpen: false,
        deleteOpen: false,
        deleting: false,
        successMessage: "",
        successOpen: false,
        selectedContractDiet: "",
        promoteOpen: false,
        promoteMode: "admin",
        promoting: false,
        promoteError: null,
        demoteOpen: false,
        demoting: false,
        demoteError: null,
        seniorDemoteOpen: false,
        seniorDemoting: false,
        seniorDemoteError: null,
      };
    },
    setInvigilatorsPageUi(state, action: PayloadAction<Partial<InvigilatorsPageUi>>) {
      Object.assign(state.invigilatorsPageUi, action.payload);
    },
    resetInvigilatorsPageUi(state) {
      state.invigilatorsPageUi = {
        addOpen: false,
        successOpen: false,
        successMessage: "",
        deleteOpen: false,
        deleteError: null,
        calendarModalOpen: false,
        currentMonthIndex: 0,
        bulkAction: "",
        exporting: false,
        notifyOpen: false,
        exportDialogOpen: false,
        selectedIds: [],
        selectedDate: null,
      };
    },
    setAddExamDraft(state, action: PayloadAction<Partial<ExamDialogDraft>>) {
      Object.assign(state.examDialogs.add, action.payload);
    },
    resetAddExamDraft(state) {
      state.examDialogs.add = { ...emptyExamDraft };
    },
    setEditExamDraft(
      state,
      action: PayloadAction<{ examId: number; draft: Partial<ExamDialogDraft> }>
    ) {
      const { examId, draft } = action.payload;
      state.examDialogs.edit[examId] = {
        ...(state.examDialogs.edit[examId] || { ...emptyExamDraft }),
        ...draft,
      };
    },
    resetEditExamDraft(state, action: PayloadAction<number>) {
      delete state.examDialogs.edit[action.payload];
    },
    setDashboardPrefs(state, action: PayloadAction<Partial<DashboardPrefs>>) {
      Object.assign(state.dashboard, action.payload);
    },
    setAdminProfileUi(state, action: PayloadAction<Partial<AdminProfileUi>>) {
      Object.assign(state.adminProfileUi, action.payload);
    },
    resetAdminProfileUi(state) {
      state.adminProfileUi = {
        name: "",
        email: "",
        phone: "",
        photoPreview: null,
        avatarData: null,
        confirmRemoveOpen: false,
        showPhotoSave: false,
        snackbar: { open: false, message: "", severity: "success" },
        lastUpdated: "Just now",
        lastLogin: null,
        deleteAccountOpen: false,
        darkMode: false,
        notifications: true,
        notifyEmail: "instant",
        notifySms: false,
        notifyPush: false,
        passwords: { current: "", next: "", confirm: "" },
        showPasswords: false,
        extraSessionsToShow: 0,
      };
    },
    setAdminLayoutUi(state, action: PayloadAction<Partial<AdminLayoutUi>>) {
      Object.assign(state.adminLayoutUi, action.payload);
    },
    setInvigilatorLayoutUi(state, action: PayloadAction<Partial<InvigilatorLayoutUi>>) {
      Object.assign(state.invigilatorLayoutUi, action.payload);
    },
    setInvigilatorSelfProfileUi(state, action: PayloadAction<Partial<InvigilatorSelfProfileUi>>) {
      Object.assign(state.invigilatorSelfProfileUi, action.payload);
    },
    resetInvigilatorSelfProfileUi(state) {
      state.invigilatorSelfProfileUi = {
        darkMode: false,
        notifyEmail: "instant",
        notifySms: false,
        notifyPush: false,
        name: "",
        email: "",
        phone: "",
        photoPreview: null,
        avatarData: null,
        confirmRemoveOpen: false,
        showPhotoSave: false,
        lastUpdated: "Just now",
        lastLogin: null,
        deleteAccountOpen: false,
        snackbar: { open: false, message: "", severity: "success" },
        passwords: { current: "", next: "", confirm: "" },
        showPasswords: false,
        extraSessionsToShow: 0,
      };
    },
    setInvigilatorDashboardUi(state, action: PayloadAction<Partial<InvigilatorDashboardUi>>) {
      Object.assign(state.invigilatorDashboardUi, action.payload);
    },
    resetInvigilatorDashboardUi(state) {
      state.invigilatorDashboardUi = {
        visibleCount: 4,
        activeAnnouncementIndex: 0,
        notificationQuery: "",
        selectedNotificationType: null,
      };
    },
    setInvigilatorTimetableUi(state, action: PayloadAction<Partial<InvigilatorTimetableUi>>) {
      Object.assign(state.invigilatorTimetableUi, action.payload);
    },
    resetInvigilatorTimetableUi(state) {
      state.invigilatorTimetableUi = {
        selectedDate: null,
        dateInput: "",
        month: new Date().toISOString(),
        drawerOpen: false,
        drawerAssignmentId: null,
        cancelNote: "",
        drawerMode: "request",
        snackbar: { open: false, message: "", severity: "success" },
      };
    },
    setInvigilatorRestrictionsUi(state, action: PayloadAction<Partial<InvigilatorRestrictionsUi>>) {
      Object.assign(state.invigilatorRestrictionsUi, action.payload);
    },
    resetInvigilatorRestrictionsUi(state) {
      state.invigilatorRestrictionsUi = {
        selectedDiet: null,
        queryDiet: null,
        days: [],
        snackbar: { open: false, message: "", severity: "success" },
      };
    },
    setInvigilatorShiftsUi(state, action: PayloadAction<Partial<InvigilatorShiftsUi>>) {
      Object.assign(state.invigilatorShiftsUi, action.payload);
    },
    resetInvigilatorShiftsUi(state) {
      state.invigilatorShiftsUi = {
        snackbar: { open: false, message: "", severity: "success" },
        dialogShiftId: null,
      };
    },
    resetAdminPrefs(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
  setExamsPrefs,
  setVenuesPrefs,
  setStudentsPrefs,
  setInvigilatorsPrefs,
  setCalendarPrefs,
  setAssignInvigilatorDraft,
  resetAssignInvigilatorDraft,
  setAddVenueDraft,
  resetAddVenueDraft,
  setEditVenueDraft,
  resetEditVenueDraft,
  setAddInvigilatorDraft,
  resetAddInvigilatorDraft,
  setEditInvigilatorDraft,
  resetEditInvigilatorDraft,
  setAnnouncementDraft,
  resetAnnouncementDraft,
  setDietManagerDraft,
  setUploadFileDraft,
  setExportInvigilatorDialogDraft,
  resetExportInvigilatorDialogDraft,
  setNotifyDialogDraft,
  resetNotifyDialogDraft,
  setExamsPageUi,
  resetExamsPageUi,
  setExamPageUi,
  resetExamPageUi,
  setAddExamUi,
  setVenuesPageUi,
  resetVenuesPageUi,
  setVenuePageUi,
  resetVenuePageUi,
  setStudentsPageUi,
  resetStudentsPageUi,
  setCalendarUi,
  resetCalendarUi,
  setInvigilatorProfileUi,
  resetInvigilatorProfileUi,
  setInvigilatorsPageUi,
  resetInvigilatorsPageUi,
  setAddExamDraft,
  resetAddExamDraft,
  setEditExamDraft,
  resetEditExamDraft,
  setDashboardPrefs,
  setAdminProfileUi,
  resetAdminProfileUi,
  setAdminLayoutUi,
  setInvigilatorLayoutUi,
  setInvigilatorSelfProfileUi,
  resetInvigilatorSelfProfileUi,
  setInvigilatorDashboardUi,
  resetInvigilatorDashboardUi,
  setInvigilatorTimetableUi,
  resetInvigilatorTimetableUi,
  setInvigilatorRestrictionsUi,
  resetInvigilatorRestrictionsUi,
  setInvigilatorShiftsUi,
  resetInvigilatorShiftsUi,
  resetAdminPrefs,
} = adminTablesSlice.actions;

// Factory so tests/components can get an isolated store instance when needed
export const createStoreInstance = () =>
  configureStore({
    reducer: {
      adminTables: adminTablesSlice.reducer,
    },
  });

// Default app-wide store
export const store = createStoreInstance();

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
