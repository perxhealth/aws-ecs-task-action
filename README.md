
![Perx Health](https://user-images.githubusercontent.com/4101096/163123610-9dfa9263-1518-4f5d-8839-9ddc142a513e.png)

# AWS ECS Run Task

**Note:** This action is designed for use within Perx Health's infrastructure...
it might not be very useful for other scenarios!

This repository contains a **GitHub Action** allowing you to run ECS tasks
by providing a task definition.

## Usage Example

As an example, add the following `step` to a GitHub Actions workflow.

```yaml
- name: 🚀 Migrate Database
  uses: perxhealth/aws-ecs-task-action@v1
  with:
    perx_env: qa
    perx_region: au
    perx_app_name: behavioural-science-hacks
    definition: /path/to/definition.tpl.json
```

### Inputs

The Action currently expects four required inputs, and no further optional
inputs.

**NOTE**: Input names are underscores, not hyphenated.

1. `perx_env`

    Name of the Perx Environment which the deploy will target.

2. `perx_region`

    Name of the Perx Region, representing locations on Earth and data
    sovereignty boundaries where the deploy will live.

3. `perx_app_name`

    Name of the application/service itself. This is expected to match the
    application/service's cluster/runner naming convention.

4. `definition`

    Location on disk from where the task definition file can be read. This
    is the task definition which is then registered with ECS.

### Outputs

1. `task-definition-arn`

    ARN of the resultant task definition on ECS

2. `task-arns`

    Array of ARNs which identify the resultant tasks

3. `tasks-started-count`

    Provides the total number of how many ECS Tasks were started, regardless of
    their status or success

4. `tasks-started-failed-count`

    Provides the total number of ECS tasks which failed to start

## AWS Credentials

The Action currently expects AWS credentials to exist in the environment, with
sufficient permissions to perform the following actions.

### ECS

- `DescribeTasks`
- `RegisterTaskDefinition`
- `RunTask`

## Development

The Action is written in Node with the main entrypoint being `src/index.ts`.

### Clone the repository

```bash
$ git clone git@github.com:perxhealth/aws-ecs-task-action.git
$ cd aws-ecs-task-action
```

### Testing

At the time of writing, there's no test suite to run.
