import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Toolbar,
  Typography,
  Collapse,
  Paper,
  Checkbox,
  IconButton,
  Tooltip,
  InputBase,
  Link as MUILink,
  CircularProgress,
  Chip,
  Divider,
  Stack,
  Fab,
} from '@mui/material';
import { visuallyHidden } from '@mui/utils';
import { Delete as DeleteIcon, Edit as EditIcon, ExpandMore as ExpandMoreIcon, Search as SearchIcon, ArrowForward as ArrowForwardIcon, PostAdd as PostAddIcon } from '@mui/icons-material';
import { Link, useNavigate } from 'react-router-dom';
import { apiBaseUrl, apiFetch } from '../../utils/api';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';
import { PillButton } from "../../components/PillButton";
import { Panel } from "../../components/Panel";
import { DeleteConfirmationDialog } from "../../components/admin/DeleteConfirmationDialog";
import { AddExamDialog } from "../../components/admin/AddExamDialog";
import { useAppDispatch, useAppSelector, setExamsPrefs, setExamsPageUi } from '../../state/store';

interface ExamData {
  exam_id: number;
  exam_name: string;
  course_code: string;
  no_students: number;
  exam_school: string;
  school_contact: string;
  venues: string[];
  exam_venues: ExamVenueData[];
}

interface ExamVenueData {
  examvenue_id: number;
  venue_name: string;
  start_time: string | null;
  exam_length: number | null;
  core: boolean;
  provision_capabilities: string[];
}

interface RowData {
  id: number;
  code: string;
  subject: string;
  coreVenue: string;
  startTime: string;
  endTime: string;
  duration: string;
  otherVenues: OtherVenueRow[];
  searchIndex: string;
}

interface OtherVenueRow {
  id: number;
  venue: string;
  startTime: string;
  endTime: string;
  duration: string;
}

type Order = 'asc' | 'desc';

interface HeadCell {
  disablePadding: boolean;
  id: keyof RowData;
  label: string;
  numeric: boolean;
}

const headCells: readonly HeadCell[] = [
  { id: 'code', numeric: false, disablePadding: true, label: 'Exam Code' },
  { id: 'subject', numeric: false, disablePadding: false, label: 'Subject' },
  { id: 'coreVenue', numeric: false, disablePadding: false, label: 'Venue' },
  { id: 'startTime', numeric: false, disablePadding: false, label: 'Start Time' },
  { id: 'endTime', numeric: false, disablePadding: false, label: 'End Time' },
];

const fetchExams = async (): Promise<ExamData[]> => {
  const response = await apiFetch(`${apiBaseUrl}/exams/`);
  if (!response.ok) throw new Error('Unable to load exams');
  return response.json();
};

const getPrimaryExamVenue = (exam: ExamData): ExamVenueData | undefined => {
  const venues = exam.exam_venues || [];
  return venues.find((v) => v.core) || venues[0];
};

function formatDateTime(dateTime: string): string {
  if (!dateTime) return 'N/A';
  const date = new Date(dateTime);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function calculateDuration(startTime: string, endTime: string): string {
  if (!startTime || !endTime) return 'N/A';
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'N/A';
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 'N/A';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.round((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : ''].filter(Boolean).join(' ') || '0m';
}

function descendingComparator<T>(a: T, b: T, orderBy: keyof T) {
  if (b[orderBy] < a[orderBy]) return -1;
  if (b[orderBy] > a[orderBy]) return 1;
  return 0;
}

function getComparator<Key extends keyof RowData>(order: Order, orderBy: Key) {
  return order === 'desc'
    ? (a: RowData, b: RowData) => descendingComparator(a, b, orderBy)
    : (a: RowData, b: RowData) => -descendingComparator(a, b, orderBy);
}

interface EnhancedTableProps {
  numSelected: number;
  onRequestSort: (event: React.MouseEvent<unknown>, property: keyof RowData) => void;
  onSelectAllClick: (event: React.ChangeEvent<HTMLInputElement>) => void;
  order: Order;
  orderBy: keyof RowData;
  rowCount: number;
}

function EnhancedTableHead(props: EnhancedTableProps) {
  const { onSelectAllClick, order, orderBy, numSelected, rowCount, onRequestSort } = props;
  const createSortHandler = (property: keyof RowData) => (event: React.MouseEvent<unknown>) => onRequestSort(event, property);

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            color="primary"
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            inputProps={{ 'aria-label': 'select all exams' }}
            disabled={rowCount === 0}
          />
        </TableCell>
        {headCells.map((headCell) => (
          <TableCell key={headCell.id} align={headCell.numeric ? 'right' : 'left'} padding={headCell.disablePadding ? 'none' : 'normal'} sortDirection={orderBy === headCell.id ? order : false}>
            <TableSortLabel active={orderBy === headCell.id} direction={orderBy === headCell.id ? order : 'asc'} onClick={createSortHandler(headCell.id)}>
              {headCell.label}
              {orderBy === headCell.id && <Box component="span" sx={visuallyHidden}>{order === 'desc' ? 'sorted descending' : 'sorted ascending'}</Box>}
            </TableSortLabel>
          </TableCell>
        ))}
        <TableCell align="left">Duration</TableCell>
        <TableCell align="center">Details</TableCell>
      </TableRow>
    </TableHead>
  );
}

interface EnhancedTableToolbarProps {
  numSelected: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit: () => void;
  onEditSelected: () => void;
  onDeleteSelected: () => void;
  deleteLoading: boolean;
}

function EnhancedTableToolbar({ numSelected, searchQuery, onSearchChange, onSearchSubmit, onEditSelected, onDeleteSelected, deleteLoading }: EnhancedTableToolbarProps) {
  return (
    <Toolbar sx={[{ pl: { sm: 2 }, pr: { xs: 1, sm: 1 } }, numSelected > 0 && { bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity) }]}>
      {numSelected > 0 ? (
        <Typography sx={{ flex: '1 1 100%' }} color="inherit" variant="subtitle1" component="div">
          {numSelected} selected
        </Typography>
      ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flex: '1 1 100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', backgroundColor: 'action.hover', borderRadius: 1, px: 2, py: 0.5 }}>
            <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
            <InputBase
              placeholder="Search exams..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onSearchSubmit();
                }
              }}
              sx={{ width: 220 }}
            />
            <IconButton aria-label="Apply search" color="primary" onClick={onSearchSubmit} sx={{ ml: 1 }}>
              <ArrowForwardIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
      )}
      {numSelected > 0 && (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {numSelected === 1 && (
            <PillButton
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
              onClick={onEditSelected}
            >
              Edit
            </PillButton>
          )}
          <PillButton
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={onDeleteSelected}
            disabled={deleteLoading}
          >
            Delete
          </PillButton>
        </Box>
      )}
    </Toolbar>
  );
}

export const AdminExams: React.FC = () => {
  const dispatch = useAppDispatch();
  const { order, orderBy: rawOrderBy, page, rowsPerPage, searchQuery, searchDraft } = useAppSelector((s) => s.adminTables.exams);
  const { addOpen, deleteOpen, deleteTargetIds, deleteError, selectedIds, openRows } = useAppSelector((s) => s.adminTables.examsPage);
  const allowedSortKeys = ['code', 'subject', 'coreVenue', 'startTime', 'endTime'] as const;
  type ExamSortKey = typeof allowedSortKeys[number];
  const orderBy: ExamSortKey = allowedSortKeys.includes(rawOrderBy as ExamSortKey)
    ? (rawOrderBy as ExamSortKey)
    : 'code';
  const selected = selectedIds;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchDraftInitialized = React.useRef(false);
  React.useEffect(() => {
    if (searchDraftInitialized.current) return;
    if (!searchDraft && searchQuery) {
      dispatch(setExamsPrefs({ searchDraft: searchQuery }));
    }
    searchDraftInitialized.current = true;
  }, [dispatch, searchDraft, searchQuery]);

  const { data: examsData = [], isLoading, isError, error, refetch } = useQuery<ExamData[], Error>({ queryKey: ['exams-table'], queryFn: fetchExams });

  const rows = React.useMemo<RowData[]>(() => examsData.map((exam) => {
    const coreVenue = getPrimaryExamVenue(exam);
    const otherVenues = (exam.exam_venues || []).filter((v) => !coreVenue || v.examvenue_id !== coreVenue.examvenue_id);
    const coreEndTime = coreVenue?.start_time && coreVenue.exam_length != null
      ? new Date(new Date(coreVenue.start_time).getTime() + coreVenue.exam_length * 60000).toISOString()
      : '';

    return {
      id: exam.exam_id,
      code: exam.course_code,
      subject: exam.exam_name,
      coreVenue: coreVenue?.venue_name || '—',
      startTime: coreVenue?.start_time || '',
      endTime: coreEndTime,
      duration: calculateDuration(coreVenue?.start_time || '', coreEndTime),
      otherVenues: otherVenues.map((venue) => {
        const endTime = venue.start_time && venue.exam_length != null
          ? new Date(new Date(venue.start_time).getTime() + venue.exam_length * 60000).toISOString()
          : '';
        return { id: venue.examvenue_id, venue: venue.venue_name, startTime: venue.start_time || '', endTime, duration: calculateDuration(venue.start_time || '', endTime) };
      }),
      searchIndex: [exam.course_code, exam.exam_name, coreVenue?.venue_name || '', ...otherVenues.map((v) => v.venue_name)].join(' ').toLowerCase(),
    };
  }), [examsData]);

  const rowMap = React.useMemo(() => {
    const map = new Map<number, RowData>();
    rows.forEach((row) => map.set(row.id, row));
    return map;
  }, [rows]);

  const deleteMutation = useMutation<void, Error, number[]>({
    mutationFn: async (ids: number[]) => {
      const res = await apiFetch(`${apiBaseUrl}/exams/bulk-delete/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Bulk delete failed");
      }
    },
    onSuccess: async (_data, ids) => {
      dispatch(setExamsPageUi({ selectedIds: selected.filter((id) => !ids.includes(id)) }));
      dispatch(setExamsPageUi({ deleteOpen: false, deleteTargetIds: [], deleteError: null }));
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['exams-table'] }),
        queryClient.invalidateQueries({ queryKey: ['exams-calendar'] }),
      ]);
    },
    onError: (err: any) => dispatch(setExamsPageUi({ deleteError: err?.message || "Delete failed" })),
  });

  const summary = React.useMemo(() => {
    const total = examsData.length;
    const upcoming = examsData.filter((e) => {
      const primary = getPrimaryExamVenue(e);
      if (!primary?.start_time) return false;
      const start = new Date(primary.start_time);
      return start > new Date();
    }).length;
    const totalVenues = examsData.reduce((acc, e) => acc + (e.exam_venues?.length || 0), 0);
    return { total, upcoming, totalVenues };
  }, [examsData]);

  const handleSelectAllClick = (event: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setExamsPageUi({ selectedIds: event.target.checked ? rows.map((n) => n.id) : [] }));
  };

  const handleRequestSort = (event: React.MouseEvent<unknown>, property: keyof RowData) => {
    const isAsc = orderBy === property && order === 'asc';
    dispatch(setExamsPrefs({ order: isAsc ? 'desc' : 'asc', orderBy: property }));
  };

  const handleClick = (event: React.MouseEvent<unknown>, id: number) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected: readonly number[] = [];
    if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
    else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
    else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
    else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
    dispatch(setExamsPageUi({ selectedIds: [...newSelected] }));
  };

  const handleChangePage = (_event: unknown, newPage: number) => dispatch(setExamsPrefs({ page: newPage }));
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = parseInt(event.target.value, 10);
    dispatch(setExamsPrefs({ rowsPerPage: next, page: 0 }));
  };
  const applySearch = () => {
    const trimmed = searchDraft.trim();
    dispatch(setExamsPrefs({ searchQuery: trimmed, searchDraft: trimmed, page: 0 }));
  };
  const handleSearchChange = (query: string) => {
    if (query === "") {
      dispatch(setExamsPrefs({ searchDraft: "", searchQuery: "", page: 0 }));
      return;
    }
    dispatch(setExamsPrefs({ searchDraft: query }));
  };
  const handleEditSelected = () => {
    if (selected.length === 1) navigate(`/admin/exam/${selected[0]}`);
  };
  const openDeleteDialogForSelection = React.useCallback(() => {
    const targets = selected.map((id) => rowMap.get(id)).filter(Boolean) as RowData[];
    if (!targets.length) return;
    dispatch(setExamsPageUi({
      deleteOpen: true,
      deleteTargetIds: targets.map((target) => target.id),
      deleteError: null,
    }));
  }, [selected, rowMap]);
  const handleDeleteSelected = openDeleteDialogForSelection;

  const deleteTargets = React.useMemo(
    () => deleteTargetIds.map((id) => rowMap.get(id)).filter(Boolean) as RowData[],
    [deleteTargetIds, rowMap]
  );
  const deleteCount = deleteTargets.length;
  const deleteTarget = deleteTargets[0];

  const filteredRows = React.useMemo(() => {
    if (!searchQuery) return rows;
    const lowerQuery = searchQuery.toLowerCase();
    return rows.filter((row) =>
      row.code.toLowerCase().includes(lowerQuery) ||
      row.subject.toLowerCase().includes(lowerQuery) ||
      row.coreVenue.toLowerCase().includes(lowerQuery) ||
      row.searchIndex.includes(lowerQuery) ||
      formatDateTime(row.startTime).toLowerCase().includes(lowerQuery) ||
      formatDateTime(row.endTime).toLowerCase().includes(lowerQuery)
    );
  }, [rows, searchQuery]);

  const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - filteredRows.length) : 0;
  const visibleRows = React.useMemo(() => [...filteredRows].sort(getComparator(order, orderBy as keyof RowData)).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage), [order, orderBy, page, rowsPerPage, filteredRows]);

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredRows.length / rowsPerPage) - 1);
    if (page > maxPage) dispatch(setExamsPrefs({ page: maxPage }));
  }, [filteredRows.length, rowsPerPage, page, dispatch]);

  if (isLoading) 
    return (
      <Box sx={{ p: 6, textAlign: 'center' }}>
        <CircularProgress size={60} />
        <Typography sx={{ mt: 2 }}>Loading exams…</Typography>
      </Box>
    );
  if (isError) return <Box sx={{ width: '100%', maxWidth: 1050, p: 3, mx: 'auto' }}><Panel><Typography color="error" variant="h6">{error?.message || 'Failed to load exams'}</Typography></Panel></Box>;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <Box sx={{ width: '100%', maxWidth: 1200, p: { xs: 2, md: 4 }, mx: 'auto' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" rowGap={1.5}>
          <Box>
            <Typography variant="h4" fontWeight={700}>Exams</Typography>
            <Typography variant="body2" color="text.secondary">Manage exam schedules, venues, and timings.</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip
              label={`${summary.total} Exams`}
              size="medium"
              sx={{
                backgroundColor: "#e3f2fd",
                color: "primary.main",
                fontWeight: 600,
              }}
            />
            <Chip
              label={`${summary.upcoming} Upcoming`}
              size="medium"
              sx={{
                backgroundColor: alpha("#2e7d32", 0.12),
                color: "success.main",
                fontWeight: 600,
              }}
            />
            <Chip
              label={`${summary.totalVenues} Venues`}
              size="medium"
              sx={{
                backgroundColor: "#f0f0f0ff",
                fontWeight: 600,
              }}
            />
          </Stack>
        </Stack>

        <Panel disableDivider sx={{ p: 0, overflow: 'hidden'}}>
          <EnhancedTableToolbar
            numSelected={selected.length}
            searchQuery={searchDraft || searchQuery}
            onSearchChange={handleSearchChange}
            onSearchSubmit={applySearch}
            onEditSelected={handleEditSelected}
            onDeleteSelected={handleDeleteSelected}
            deleteLoading={deleteMutation.isPending}
          />
          <Divider />
          <TableContainer>
            <Table sx={{ minWidth: 750 }} aria-labelledby="tableTitle" size="medium">
              <EnhancedTableHead numSelected={selected.length} order={order} orderBy={orderBy} onSelectAllClick={handleSelectAllClick} onRequestSort={handleRequestSort} rowCount={filteredRows.length} />
              <TableBody>
                {visibleRows.map((row, index) => {
                  const isItemSelected = selected.includes(row.id);
                  const labelId = `enhanced-table-checkbox-${index}`;
                  const isOpen = openRows[row.id] || false;
                  return (
                    <React.Fragment key={row.id}>
                      <TableRow hover role="checkbox" aria-checked={isItemSelected} tabIndex={-1} selected={isItemSelected}>
                        <TableCell padding="checkbox">
                          <Checkbox color="primary" checked={isItemSelected} onClick={(event) => handleClick(event, row.id)} inputProps={{ 'aria-labelledby': labelId }} />
                        </TableCell>
                        <TableCell component="th" id={labelId} scope="row" padding="none">
                        <MUILink
                          component={Link}
                          to={`/admin/exam/${row.id}`}
                          sx={{ cursor: 'pointer', fontWeight: 600 }}
                          underline="hover"
                        >
                          {row.code}
                        </MUILink>
                        </TableCell>
                        <TableCell>{row.subject}</TableCell>
                        <TableCell>{row.coreVenue || '—'}</TableCell>
                        <TableCell>{formatDateTime(row.startTime)}</TableCell>
                        <TableCell>{formatDateTime(row.endTime)}</TableCell>
                        <TableCell>{row.duration}</TableCell>
                        <TableCell align="center">
                          <IconButton
                            aria-label={isOpen ? 'Collapse exam venues' : 'Expand exam venues'}
                            onClick={() =>
                              dispatch(
                                setExamsPageUi({
                                  openRows: {
                                    ...openRows,
                                    [row.id]: !openRows[row.id],
                                  },
                                })
                              )
                            }
                          >
                            <ExpandMoreIcon sx={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }} />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={headCells.length + 3}>
                          <Collapse in={isOpen} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 2 }}>
                              <Typography variant="subtitle1" gutterBottom>Other venues for this exam</Typography>
                              {row.otherVenues.length ? (
                                <Table size="small" aria-label="other venues">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Venue</TableCell>
                                      <TableCell>Start</TableCell>
                                      <TableCell>End</TableCell>
                                      <TableCell>Duration</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {row.otherVenues.map((venue) => (
                                      <TableRow key={venue.id}>
                                        <TableCell>{venue.venue}</TableCell>
                                        <TableCell>{formatDateTime(venue.startTime)}</TableCell>
                                        <TableCell>{formatDateTime(venue.endTime)}</TableCell>
                                        <TableCell>{venue.duration}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              ) : <Typography variant="body2" color="text.secondary">No additional venues for this exam.</Typography>}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
                {!filteredRows.length && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Typography variant="body2" color="text.secondary">No exam records found.</Typography>
                    </TableCell>
                  </TableRow>
                )}
                {emptyRows > 0 && <TableRow style={{ height: 53 * emptyRows }}><TableCell colSpan={8} /></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
          <Divider />
          <TablePagination rowsPerPageOptions={[10, 25, 50, 100]} component="div" count={filteredRows.length} rowsPerPage={rowsPerPage} page={page} onPageChange={handleChangePage} onRowsPerPageChange={handleChangeRowsPerPage} />
        </Panel>
        <DeleteConfirmationDialog
          open={deleteOpen}
          title={deleteCount > 1 ? "Delete exams?" : "Delete exam?"}
          description={
            <>
              {deleteCount > 1 ? (
                <>
                  This will permanently delete <strong>{deleteCount}</strong> exams.
                </>
              ) : (
                <>
                  This will permanently delete the exam record for{" "}
                  <strong>{deleteTarget?.code || "this exam"}</strong>
                  {deleteTarget?.subject ? ` • ${deleteTarget.subject}.` : "."}
                </>
              )}
              {deleteError ? (
                <Typography sx={{ mt: 2 }} color="error">
                  {deleteError}
                </Typography>
              ) : null}
            </>
          }
          confirmText={deleteCount > 1 ? `Delete ${deleteCount}` : "Delete"}
          loading={deleteMutation.isPending}
          onClose={() => {
            if (!deleteMutation.isPending) {
              dispatch(setExamsPageUi({ deleteOpen: false, deleteTargetIds: [], deleteError: null }));
            }
          }}
          onConfirm={() => {
            if (deleteTargets.length) deleteMutation.mutate(deleteTargets.map((target) => target.id));
          }}
        />
        <AddExamDialog
          open={addOpen}
          onClose={() => dispatch(setExamsPageUi({ addOpen: false }))}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["exams-table"] });
          }}
        />
        <Tooltip title="Add a new exam">
          <Fab
            color="primary"
            onClick={() => dispatch(setExamsPageUi({ addOpen: true }))}
            sx={{
              position: 'fixed',
              bottom: 32,
              right: 32,
              boxShadow: 3,
            }}
            aria-label="Add exam"
          >
            <PostAddIcon />
          </Fab>
        </Tooltip>
      </Box>
    </LocalizationProvider>
  );
};
