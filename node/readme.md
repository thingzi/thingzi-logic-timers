A collection of useful nodes to help with time based automation.  

Despite the large number of timer nodes available for node red i never found one i was satisfied with.  Some were far too simple and others way too complicated.  In the end i made my own which are indended to be reliable & easy to use with a clean design.

### Timer Node
Daily on/off timer node that supports fixed times of the day or sun events.  Useful for setting timers such as lights that go on when its dark and off of at a fixed time.

### Time Check Node
Time check node for testing if a time (default current time) is within the set range including sun events. The original message is forwarded to different outputs based on pass/fail.

### Schedule Node
Set events for a weekly schedule using a visual calendar.  Useful for schedules such as heating where you have a morning time, evening time and these may vary at the weekend.

If you like/use this node, coffee makes me happy and it keeps me coding when i should be sleeping...

<a href="https://www.buymeacoffee.com/thingzi" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 50px !important;width: 200px !important;" ></a>
### Release Notes

<b>1.1.8</b>

- Add an option to time check to forward messages as valid on unchecked days

<b>1.1.7</b>

- No code changes, updated package links for github

<b>1.1.5</b>

- Added extra output for time check node to handle time not in range
- Optional input for time check node 'time' to check a fixed time value, rather than the current time.

<b>1.1.3</b>

- Fixed timer bug for incorrect sun event on the day where clocks daylight savings changes are made
- Previously sun events were calculated for the day they were scheduled and not the day they trigger resulting in small amount of error.

<b>1.1.2</b>

- Fixed bug in timer when using a negative offset.
- Limit random offset to 60 minutes.
- Handle case were no week days are selected in a timer.