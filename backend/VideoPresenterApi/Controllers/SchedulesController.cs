using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VideoPresenterApi.Contracts;
using VideoPresenterApi.Services;

namespace VideoPresenterApi.Controllers;

[ApiController]
[Route("api/schedules")]
[Authorize]
public sealed class SchedulesController(ISchedulesService service) : ControllerBase
{
    [HttpGet(Name = "GetAllSchedules")]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        if (!IsTokenType("user")) return Forbid();
        return Ok((await service.GetAllAsync(ct)).Select(ScheduleResponse.From));
    }

    [HttpGet("{id:guid}", Name = "GetSchedule")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        if (!IsTokenType("user")) return Forbid();
        var schedule = await service.GetAsync(id, ct);
        return schedule is null ? NotFound() : Ok(ScheduleResponse.From(schedule));
    }

    [HttpPost(Name = "CreateSchedule")]
    [ProducesResponseType(typeof(ScheduleResponse), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create(ScheduleRequest request, CancellationToken ct)
    {
        if (!IsTokenType("user")) return Forbid();
        var result = await service.CreateAsync(request, ct);
        return result.Status == ServiceStatus.Ok
            ? CreatedAtRoute("GetSchedule", new { id = result.Value!.Id }, ScheduleResponse.From(result.Value))
            : Error(result);
    }

    [HttpPut("{id:guid}", Name = "UpdateSchedule")]
    [ProducesResponseType(typeof(ScheduleResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid id, ScheduleRequest request, CancellationToken ct)
    {
        if (!IsTokenType("user")) return Forbid();
        var result = await service.UpdateAsync(id, request, ct);
        return result.Status == ServiceStatus.Ok ? Ok(ScheduleResponse.From(result.Value!)) : Error(result);
    }

    [HttpDelete("{id:guid}", Name = "DeleteSchedule")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
    {
        if (!IsTokenType("user")) return Forbid();
        return await service.DeleteAsync(id, ct) ? NoContent() : NotFound();
    }

    /// <summary>Harmonogramy przypisane do zalogowanego urządzenia (domyślnie tylko trwające i przyszłe).</summary>
    [HttpGet("device", Name = "GetDeviceSchedules")]
    [ProducesResponseType(typeof(IEnumerable<DeviceScheduleResponse>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetForDevice([FromQuery] bool includePast, CancellationToken ct)
    {
        if (!IsTokenType("device") || !Guid.TryParse(User.FindFirstValue("sub"), out var deviceId))
            return Forbid();
        var schedules = await service.GetForDeviceAsync(deviceId, includePast, ct);
        return Ok(schedules.Select(DeviceScheduleResponse.From));
    }

    private IActionResult Error(ServiceResult<Models.Schedule> r) => r.Status switch
    {
        ServiceStatus.NotFound => NotFound(),
        ServiceStatus.Conflict => Conflict(new { error = r.Message, conflicts = r.Conflicts }),
        _ => BadRequest(new { error = r.Message })
    };

    private bool IsTokenType(string type) => User.FindFirstValue("token_type") == type;
}
