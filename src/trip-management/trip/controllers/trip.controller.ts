import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  UploadedFile,
  Logger,
  Body,
  Put,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { TripService } from '../services/trip.service';
import { FileInterceptor } from 'node_modules/@nestjs/platform-express';
import { PermissionGuard } from 'src/auth/decorators/permissions.decorator';
import { TripFilterInput } from '../dtos/trip-filter-input.dto';
import { CurrentUser } from 'src/auth/decorators/current-user.decorator';
import {
  GenericResponse,
  PaginatedList,
} from 'src/shared/interfaces/generic-response';
import { Trip } from '../models/trip.model';
import { TripSaveJob } from '../models/trip-save-job.model';
import { TripSaveJobService } from '../services/trip-save-job.service';
import { CreateTripInput } from '../dtos/create-trip-input.dto';
import { UpdateTripInput } from '../dtos/update-trip-input.dto';
import { CompleteTripDto } from '../dtos/create-complete-trip.dto';
import { AssignCabDriverDto } from '../dtos/assign-cab-driver.dto';
import { BulkAssignCabDriverDto } from '../dtos/bulk-assign-cab-driver.dto';
import { BillingTripAssignmentDto } from '../dtos/billing-trip-assignment.dto';
import { SaveRouteCacheDto } from '../dtos/route-cache.dto';
import {
  BillingTripAttendanceDto,
  BillingTripCabArrivalDto,
  BillingTripCabArrivedDto,
  BillingTripEmployeeAddDto,
  BillingTripEmployeeOrderDto,
  BillingTripEmployeeRemoveDto,
  BillingTripEstimatedDistanceDto,
} from '../dtos/billing-trip-employees.dto';
import { BillingTripSeatsDto } from '../dtos/billing-trip-seats.dto';
import { SearchTripFilterDto } from '../dtos/search-trip-filter.dto';
import { CordonLastLocationsInput } from '../dtos/cordon-last-locations-input.dto';
import {
  excelFileFilter,
  validateUploadedFile,
} from 'src/shared/utils/file-validation.util';

@Controller('admin/trip')
@ApiTags('Trip')
@ApiBearerAuth('access-token')
export class TripController {
  private logger = new Logger(TripController.name);
  constructor(
    private readonly tripService: TripService,
    private readonly tripSaveJobService: TripSaveJobService,
  ) {}

  @Post()
  @ApiBody({
    description: 'Array of trips to create',
    type: [CreateTripInput],
  })
  @UseGuards(PermissionGuard('Trip-Create'))
  async create(
    @Body() createTripInput: CreateTripInput[],
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Array<Trip>>> {
    return this.tripService.create(createTripInput, user);
  }

  // ===================== ASYNC SAVE (Routing page) =====================
  //
  // The two sync routes above and at :trips-by-date run ~2 minutes inline and
  // the admin client's axios timeout is 100s, so the browser cancels, the
  // operator retries, and the retry creates a duplicate set. These three routes
  // are ADDITIVE: both sync routes stay live and unchanged, so deploying this
  // repo first changes nothing for the current FE.
  //
  // The reverse is NOT safe. TRIP_SAVE_JOB_WORKER_ENABLED must be 'true' on the
  // PM2 target before etms-admin-react starts calling these routes: with the
  // worker off, enqueue still returns 200 and the job sits 'pending' while the
  // page polls it. claim()'s staleness predicate only reaps 'running' rows, so
  // nothing in the claim path ages a pending row out.
  //
  // The stale-pending sweep (TripSaveJobService.failStalePending, called from
  // the worker tick) does age one out after 10 minutes — but it runs INSIDE the
  // same flag gate. So where the flag is off on every process, a pending row
  // still sits until the 7-day prune and the page polls indefinitely, exactly as
  // before. The sweep covers a worker that is down or restarting while others
  // are up, not a feature that was never switched on.
  //
  // Registered here, ahead of every ':id/...' route in this controller, so no
  // wildcard can shadow them as the file grows.
  //
  // Plain 200, not 202 — there is no @HttpCode(202) anywhere in this repo and
  // the FE reads the hand-built GenericResponse envelope, not the status code.

  @Post('async-save')
  @ApiBody({
    description: 'Array of trips to create, saved in the background',
    type: [CreateTripInput],
  })
  @UseGuards(PermissionGuard('Trip-Create'))
  async createAsync(
    @Body() createTripInput: CreateTripInput[],
    @CurrentUser() user: any,
  ): Promise<GenericResponse<{ jobID: string }>> {
    const jobID = await this.tripSaveJobService.enqueue(
      'create',
      createTripInput,
      { user: this.snapshotUser(user) },
      user?.orgID,
    );

    return {
      message: 'Saving in the background. This can take a few minutes.',
      data: { jobID: String(jobID) },
    };
  }

  @Put('trips-by-date/async')
  @ApiBody({
    description: 'Trip array to update, saved in the background',
    type: UpdateTripInput,
  })
  @UseGuards(PermissionGuard('Trip-Update'))
  async updateAsync(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
    @Body() updateTripInput: UpdateTripInput,
  ): Promise<GenericResponse<{ jobID: string }>> {
    const jobID = await this.tripSaveJobService.enqueue(
      'update',
      updateTripInput,
      { user: this.snapshotUser(user), shiftTime, date },
      user?.orgID,
    );

    return {
      message: 'Saving in the background. This can take a few minutes.',
      data: { jobID: String(jobID) },
    };
  }

  // ParseIntPipe for the same reason as billing-edit/vendors/:vendorID/drivers
  // above: the param lands in a where against a BIGINT column, and a
  // non-numeric segment reaches Postgres as "invalid input syntax for type
  // bigint" — an error with no .status, which surfaces as a 500. The pipe makes
  // it a 400.
  @Get('save-job/:id')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getSaveJob(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<TripSaveJob>> {
    return {
      ...(await this.tripSaveJobService.findOneStatus(id, user?.orgID)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip',
      ),
    };
  }

  /**
   * Exactly what the worker needs off the session, and nothing else.
   *
   * Snapshotted at enqueue time on purpose. A SuperAdmin who has switched into
   * an organization has that fact ONLY in the live session — the Authentication
   * row is switch-oblivious — so re-reading the user at execute time would
   * scope the save and its event log to the wrong org
   * (eventlog.service.ts:34-60). These five fields are also the complete set
   * TripService.create()/update() and EventLogService.create() read off `user`.
   */
  private snapshotUser(user: any) {
    return {
      id: user?.id,
      orgID: user?.orgID,
      name: user?.name,
      userType: user?.userType,
      vendorID: user?.vendorID,
    };
  }

  // Guarded with the billing-report read permission: this exposes the audit
  // trail behind the Trip Billing Report detail page.
  @Get(':id/edit-history')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async getTripEditHistory(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ): Promise<{
    items: any[];
    totalItems: number;
    searchedWindow: any;
    reason: string | null;
  }> {
    const parsedSkip = Number(skip) > 0 ? Number(skip) : 0;
    const requestedTake = Number(take) > 0 ? Number(take) : 50;
    return await this.tripService.getTripEditHistory(
      parseInt(id),
      user,
      parsedSkip,
      Math.min(requestedTake, 100),
    );
  }

  // Corrects vendor/driver/cab/security on an already-Completed trip, from the
  // Trip Billing Report detail page. Guarded with the billing UPDATE permission
  // - the same key that gates POST /admin/trip-actuals - because this is a
  // billing-side correction, not ordinary trip operations.
  //
  // Deliberately NOT folded into assign-cab-driver or trips-assign-vendor: the
  // former wipes omitted fields and must keep working on Pending trips, the
  // latter requires an Active lockStatus and nulls cab+driver on vendor change.
  @Put('billing-edit/assignment')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripAssignment(
    @Body() assignmentInput: BillingTripAssignmentDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripAssignment(
      assignmentInput,
      user,
    );
  }

  // Dropdown sources for the edit form above. All three carry the billing READ
  // permission rather than Vendors-Read/Drivers-Read/Cabs-Read: a billing-only
  // role holds none of those, and 403ing the dropdowns would break the page for
  // exactly the admins this feature exists for. Same reasoning as edit-history.
  @Get('billing-edit/vendors')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditVendors(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditVendors(user);
  }

  // ParseIntPipe on the path param: it lands in a `where` against a BIGINT
  // column, and a non-numeric segment would reach Postgres as
  // "invalid input syntax for type bigint" - an error with no .status, which the
  // service catch re-throws raw as a 500. The pipe makes it a 400.
  @Get('billing-edit/vendors/:vendorID/drivers')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditDrivers(
    @Param('vendorID', ParseIntPipe) vendorID: number,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditDrivers(vendorID, user);
  }

  @Get('billing-edit/vendors/:vendorID/cabs')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditCabs(
    @Param('vendorID', ParseIntPipe) vendorID: number,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditCabs(vendorID, user);
  }

  // Security is org-scoped, not vendor-scoped, so this takes no vendorID.
  // It exists rather than reusing GET /admin/security for the same reason as
  // the three routes above: that one is guarded by 'Security-Read', which a
  // billing-only role does not hold. It also filters Active unconditionally,
  // which /admin/security does not - keeping the dropdown and the write-path
  // validation in agreement.
  @Get('billing-edit/securities')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditSecurities(
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditSecurities(user);
  }

  // --- Billing-edit: employee roster / attendance on a Completed trip -------
  //
  // All six writes carry 'Trip Billing Report-Update', the same key that gates
  // POST /admin/trip-actuals and billing-edit/assignment. They deliberately do
  // NOT reuse the existing employee routes (update-employee-to-trip:435,
  // remove-employee-trip:535, update-employee-order-trip:450,
  // update-cab-arrival:675): those carry 'Trip-Update', have no Trip.status
  // check, no reason, no org scope and no EventLog, and they are consumed by
  // trip/addEmployee, trip/tripTable and dashboard/LiveTripTable. None of them
  // are modified by this slice.
  //
  // Every route below is Completed-only, org-scoped to the trip, requires a
  // non-empty reason and writes an EventLog entry readable through
  // GET /admin/trip/:id/edit-history. None of them touch TripActual.

  @Put('billing-edit/employees/add')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripEmployeeAdd(
    @Body() input: BillingTripEmployeeAddDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripEmployeeAdd(input, user);
  }

  // Flags the entry removedByAdmin and keeps it in employees[]; it does NOT
  // splice. The FE is responsible for hiding flagged entries - see the contract
  // note.
  @Put('billing-edit/employees/remove')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripEmployeeRemove(
    @Body() input: BillingTripEmployeeRemoveDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripEmployeeRemove(input, user);
  }

  @Put('billing-edit/employees/order')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripEmployeeOrder(
    @Body() input: BillingTripEmployeeOrderDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripEmployeeOrder(input, user);
  }

  @Put('billing-edit/employees/attendance')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripAttendance(
    @Body() input: BillingTripAttendanceDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripAttendance(input, user);
  }

  @Put('billing-edit/employees/cab-arrival')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripCabArrival(
    @Body() input: BillingTripCabArrivalDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripCabArrival(input, user);
  }

  @Get('billing-edit/employees/:tripID/cab-arrived')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditEmployeeCabArrivals(
    @Param('tripID', ParseIntPipe) tripID: number,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditEmployeeCabArrivals(
      tripID,
      user,
    );
  }

  @Put('billing-edit/employees/cab-arrived')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripCabArrived(
    @Body() input: BillingTripCabArrivedDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripCabArrived(input, user);
  }

  @Put('billing-edit/estimated-distance')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripEstimatedDistance(
    @Body() input: BillingTripEstimatedDistanceDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripEstimatedDistance(
      input,
      user,
    );
  }

  // Dropdown source for the add form. ParseIntPipe for the same reason as the
  // slice-2 vendor routes: the value lands in a `where` against a BIGINT column,
  // and a non-numeric segment would reach Postgres as "invalid input syntax for
  // type bigint" - an error with no .status, which the service catch re-throws
  // raw as a 500. The pipe makes it a 400.
  @Get('billing-edit/employees/:tripID/addable')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditAddableEmployees(
    @Param('tripID', ParseIntPipe) tripID: number,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditAddableEmployees(tripID, user);
  }

  // Corrects the seat count on an already-Completed trip and recalculates the
  // bill at the new seat count's rate. 'Trip Billing Report-Update', same as
  // every other billing-edit write.
  @Put('billing-edit/seats')
  @UseGuards(PermissionGuard('Trip Billing Report-Update'))
  async updateBillingTripSeats(
    @Body() input: BillingTripSeatsDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateBillingTripSeats(input, user);
  }

  // Dropdown source for the seats edit above: only the seat counts the trip's
  // vendor has a BillingRate configured for, so "no rate for this seat count"
  // cannot occur on submit. 'Trip Billing Report-Read', same reasoning as the
  // vendor/driver/cab/security dropdowns above - a billing-only role holds none
  // of 'Trip Billing Configuration-Read', and 403ing this would break the page
  // for exactly the admins this feature exists for.
  @Get('billing-edit/seats/:tripID/options')
  @UseGuards(PermissionGuard('Trip Billing Report-Read'))
  async listBillingEditSeatOptions(
    @Param('tripID', ParseIntPipe) tripID: number,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<any>> {
    return await this.tripService.listBillingEditSeatOptions(tripID, user);
  }

  @Get('get-trip-by-id/:id')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Trip> {
    return await this.tripService.findOneForUser(parseInt(id), user);
  }

  @Get('get-trip-by-id-dashboard/:id')
  async findTrip(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<Trip> {
    return await this.tripService.findOneForUser(parseInt(id), user);
  }

  @Get(':id/cordon-last-location')
  async getCordonLastLocation(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getCordonLastLocation(parseInt(id), user);
  }

  @Get(':id/cordon-trail')
  async getCordonTrail(@Param('id') id: string, @CurrentUser() user: any) {
    return await this.tripService.getCordonTrail(parseInt(id), user);
  }

  @Get(':id/route-cache/mobile')
  async getRouteCacheMobile(@Param('id') id: string) {
    return await this.tripService.getRouteCacheMobile(parseInt(id));
  }

  @Get(':id/route-cache')
  async getRouteCache(
    @Param('id') id: string,
    @Query('routeType') routeType: 'actual' | 'planned' = 'actual',
  ) {
    return await this.tripService.getRouteCache(parseInt(id), routeType);
  }

  @Put(':id/route-cache')
  async saveRouteCache(
    @Param('id') id: string,
    @Body() dto: SaveRouteCacheDto,
  ): Promise<GenericResponse<null>> {
    return await this.tripService.saveRouteCache(parseInt(id), dto);
  }

  @Post('cordon-last-locations')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getCordonLastLocationsBatch(
    @Body() input: CordonLastLocationsInput,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getCordonLastLocationsBatch(
      input.tripIds,
      user,
    );
  }

  @Get('trips-by-date')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripsByDate(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
    @Query('requestType') requestType?: string,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDate(
        shiftTime,
        date,
        user,
        pickDrop,
        tripFilterInput,
        requestType,
      )),
    };
  }

  @Get('trips-by-date-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async findAllTripsByDateDashboard(
    @CurrentUser() user: any,
    @Query('shiftTime') shiftTime?: string,
    @Query('date') date?: string,
    @Query('pickDrop') pickDrop?: boolean,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDateDashboard(
        user,
        shiftTime,
        date,
        pickDrop,
        tripFilterInput,
      )),
    };
  }

  @Get('trips-by-date-spoc-dashboard')
  @UseGuards(PermissionGuard('LiveDashboard-Read'))
  async findAllTripsByDateSpocDashboard(
    @CurrentUser() user: any,
    @Query('shiftTime') shiftTime?: string,
    @Query('date') date?: string,
    @Query('pickDrop') pickDrop?: boolean,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDateDashboard(
        user,
        shiftTime,
        date,
        pickDrop,
        tripFilterInput,
      )),
    };
  }

  @Get('tripsCount-by-date')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripsCount(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
    @Query('requestType') requestType?: string,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsCount(
        shiftTime,
        date,
        user,
        pickDrop,
        tripFilterInput,
        requestType,
      )),
    };
  }

  @Get('spoc-tripsCount-by-date')
  @UseGuards(PermissionGuard('Trip Spoc-Read'))
  async findAllSpocTripsCount(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
    @Query('requestType') requestType?: string,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsCount(
        shiftTime,
        date,
        user,
        pickDrop,
        tripFilterInput,
        requestType,
      )),
    };
  }

  @Get('trips-list-by-date')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripsListByDateForDownload(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
    @Query('requestType') requestType?: string,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsListByDateForDownload(
        shiftTime,
        date,
        user,
        pickDrop,
        requestType,
      )),
    };
  }

  @Get('spoc-trips-by-date')
  @UseGuards(PermissionGuard('Trip Spoc-Read'))
  async findAllSpocTripsByDate(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: boolean,
    @CurrentUser() user: any,
    @Query('requestType') requestType?: string,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDate(
        shiftTime,
        date,
        user,
        pickDrop,
        tripFilterInput,
        requestType,
      )),
    };
  }

  @Get('trips-by-date-vendor')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripsByDateForVendor(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: string,
    @Query('orgID') orgID: string,
    @CurrentUser() user: any,
    @Query() tripFilterInput?: TripFilterInput,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDateForVendor(
        shiftTime,
        date,
        user,
        pickDrop,
        orgID,
        tripFilterInput,
      )),
    };
  }

  @Get('trips-by-date-vendor-live')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripsByDateForVendorLive(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: string,
    @CurrentUser() user: any,
    @Query('orgID') orgID?: string,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAllTripsByDateForVendorLive(
        shiftTime,
        date,
        pickDrop,
        user,
        orgID,
      )),
    };
  }

  @Get('trips-status-by-employees')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findTripStatusByemployees(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @Query('pickDrop') pickDrop: string,
    @Query('employees') employees: any,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findTripStatusByemployees(
        shiftTime,
        date,
        user,
        pickDrop,
        employees,
      )),
    };
  }

  @Get()
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAll(
    @Query() tripFilterInput: TripFilterInput,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return {
      ...(await this.tripService.findAll(tripFilterInput, user)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip',
      ),
    };
  }

  @Put('trips-by-date')
  @ApiBody({ description: 'Trip array to update', type: UpdateTripInput })
  @UseGuards(PermissionGuard('Trip-Update'))
  async update(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
    @Body() updateTripInput: UpdateTripInput,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.update(
      updateTripInput,
      user,
      shiftTime,
      date,
    );
  }

  @Put('assign-cab-driver')
  async assignCabAndDriver(
    @CurrentUser() user: any,
    @Body() assignmentInput: AssignCabDriverDto,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.assignCabAndDriver(assignmentInput, user);
  }

  @Put('assign-cab-driver-bulk')
  async bulkAssignCabAndDriver(
    @CurrentUser() user: any,
    @Body() bulkAssignmentInput: BulkAssignCabDriverDto,
  ): Promise<GenericResponse<Trip[]>> {
    return await this.tripService.bulkAssignCabAndDriver(
      bulkAssignmentInput,
      user,
    );
  }

  @Put('trips-assign-vendor')
  @ApiBody({ description: 'Trip array to update', type: UpdateTripInput })
  @UseGuards(PermissionGuard('Trip-Update'))
  async assignVendor(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
    @Body() updateTripInput: UpdateTripInput,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.assignVendor(
      updateTripInput,
      user,
      shiftTime,
      date,
    );
  }

  @Put('update-employee-to-trip')
  @ApiBody({ description: 'Trip array to update', type: UpdateTripInput })
  @UseGuards(PermissionGuard('Trip-Update'))
  async updateEmployeeTrip(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
    @Body() updateTripInput: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateEmployeeTrip(updateTripInput, user);
  }

  @Put('update-employee-order-trip')
  @ApiBody({ description: 'Trip array to update', type: UpdateTripInput })
  @UseGuards(PermissionGuard('Trip-Update'))
  async updateEmployeeOrderTrip(
    @Body() updateTripInput: any,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateEmployeeOrderTrip(
      updateTripInput,
      user,
    );
  }

  @Get('trip-by-shift-time-vendor')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllTripByShiftTime(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('orgID') orgID?: string,
    @Query('shiftTime') shiftTime?: string,
    @Query('pickDrop') pickDrop?: string,
  ) {
    return await this.tripService.findAllTripByShiftTime(
      user,
      date,
      shiftTime,
      pickDrop,
      orgID,
    );
  }

  @Get('shift-time-by-trip-vendor')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllShiftTimeByTrips(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('orgID') orgID?: string,
  ) {
    return await this.tripService.findAllShiftTimeByTrips(user, date, orgID);
  }

  @Post('tripsheet-upload')
  @UseGuards(PermissionGuard('Tripsheet Upload-Read'))
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      fileFilter: excelFileFilter,
      // limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async importTripsheet(
    @UploadedFile() file: Express.Multer.File,
    @Body() date: any,
    @Body() formattedDate: any,
    @Body('action') action: string,
    @Body('selectedRows') selectedRows: string,
    @CurrentUser() user: any,
  ): Promise<object> {
    if (!file) {
      throw new BadRequestException('File is required.');
    }
    validateUploadedFile(file, 'excel');
    this.logger.log('file---', file);
    const parsedRows = selectedRows ? JSON.parse(selectedRows) : [];
    return await this.tripService.importTripsheet(
      file.buffer,
      formattedDate,
      date,
      user,
      action,
      parsedRows,
    );
  }

  @Put('lock-trip')
  @UseGuards(PermissionGuard('Trip-Update'))
  async lockTrip(
    @CurrentUser() user: any,
    @Body() tripData: any,
  ): Promise<GenericResponse<Trip>> {
    return {
      ...(await this.tripService.lockTrip(user, tripData)),
      entityPermissions: user?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Tripsheet Upload',
      ),
    };
  }

  @Put('remove-employee-trip')
  @ApiBody({ description: 'Trip array to update', type: UpdateTripInput })
  @UseGuards(PermissionGuard('Trip-Update'))
  async deleteEmployeeFromTrip(
    @CurrentUser() user: any,
    @Body() updateTripInput: any,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.deleteEmployeeFromTrip(updateTripInput, user);
  }

  @Put('complete-trip')
  async completeTrip(
    @Body() tripInput: CompleteTripDto,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return {
      ...(await this.tripService.completeTrip(tripInput, user)),
    };
  }

  @Get('vendor-trip-count')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getVendorTripCounts(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<any>> {
    return await this.tripService.getVendorTripCounts(startDate, endDate, user);
  }

  @Get('vendor-trip-count-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async getVendorTripCountsDashboard(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<any>> {
    return await this.tripService.getVendorTripCounts(startDate, endDate, user);
  }

  @Get('dashboard-trip-count')
  @UseGuards(PermissionGuard('Trip-Read'))
  async curruntDayTripsCount(): Promise<GenericResponse<any>> {
    return await this.tripService.curruntDayTripsCount();
  }

  @Get('completed-trip-count')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getCompletedTripCounts(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getCompletedTripCounts(
      startDate,
      endDate,
      user,
    );
  }

  @Get('completed-trip-count-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async getCompletedTripCountsDashboard(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getCompletedTripCounts(
      startDate,
      endDate,
      user,
    );
  }

  @Get('trip-delay-count')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getTripDelayCounts(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getTripDelayCounts(startDate, endDate, user);
  }

  @Get('trip-delay-count-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async getTripDelayCountsDashboard(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getTripDelayCounts(startDate, endDate, user);
  }

  @Get('shift-trip-details')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getShiftTripDetails(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getShiftTripDetails(shiftTime, date, user);
  }

  @Get('shift-trip-details-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async getShiftTripDetailsDashboard(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getShiftTripDetails(shiftTime, date, user);
  }

  @Get('shift-trip-details-spoc-dashboard')
  @UseGuards(PermissionGuard('LiveDashboard-Read'))
  async getShiftTripDetailsSpocDashboard(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getShiftTripDetails(shiftTime, date, user);
  }

  @Get('shift-trip-details-by-vendorID')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getShiftTripDetailsByVendorID(
    @Query('shiftTime') shiftTime: string,
    @Query('date') date: string,
    @CurrentUser() user: any,
    @Query('orgID') orgID?: string,
  ) {
    return await this.tripService.getShiftTripDetailsByVendorID(
      shiftTime,
      date,
      user,
      orgID,
    );
  }

  @Put('update-cab-arrival')
  @UseGuards(PermissionGuard('Trip-Update'))
  async updateCabArrivalTime(
    @Body('employeeId') employeeId: string,
    @Body('cabArrivalTime') cabArrivalTime: string,
    @Body('tripId') tripId: string,
  ): Promise<GenericResponse<Trip>> {
    return await this.tripService.updateCabArrivalTime(
      employeeId,
      cabArrivalTime,
      tripId,
    );
  }

  @Get('tripCount-vendor-dashboard')
  async tripCountByShiftTime(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('orgID') orgID?: string,
    @Query('shiftTime') shiftTime?: string,
    @Query('pickDrop') pickDrop?: string,
  ) {
    return await this.tripService.tripCountByShiftTime(
      user,
      date,
      shiftTime,
      pickDrop,
      orgID,
    );
  }

  @Get('cab-emp-delay-count-dashboard')
  @UseGuards(PermissionGuard('Dashboard-Read'))
  async getCabArrivalDashboard(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return await this.tripService.getCabArrivalDelayCounts(
      startDate,
      endDate,
      user,
    );
  }

  @Get('trips-for-search')
  @UseGuards(PermissionGuard('Trip-Read'))
  async getTripsForSearch(
    @Query() searchTripFilter: SearchTripFilterDto,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ): Promise<PaginatedList<Trip>> {
    return await this.tripService.getTripsForSearch(
      searchTripFilter,
      startDate,
      endDate,
      user,
    );
  }

  @Get('get-trip-for-search/:id')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findTripForSearch(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ): Promise<GenericResponse<Trip>> {
    return {
      ...(await this.tripService.findTripForSearch(id)),
      entityPermissions: user?.role?.permissions?.filter(
        (permission) => permission?.split('-')?.[0] === 'Trip',
      ),
    };
  }

  @Get('employee-wise')
  async getEmployeeWiseTripDetails(
    @Query() filters: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() user: any,
  ) {
    return this.tripService.getEmployeeWiseTripDetails(
      filters,
      startDate,
      endDate,
      user,
    );
  }

  @Get('vendor-shift-time')
  @UseGuards(PermissionGuard('Trip-Read'))
  async findAllVendorShiftTime(
    @CurrentUser() user: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return await this.tripService.findAllVendorShiftTime(
      user,
      startDate,
      endDate,
    );
  }
}
